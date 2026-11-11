package com.local.coursely.bridge

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.local.coursely.R
import com.local.coursely.ocr.OcrEngine
import com.local.coursely.ocr.OcrNormalizer
import com.local.coursely.ocr.OcrOutcome
import com.local.coursely.photo.ImageUtils
import com.local.coursely.photo.PhotoPicker
import com.local.coursely.reminder.Notifications
import com.local.coursely.reminder.ReminderLogic
import com.local.coursely.reminder.ReminderScheduler
import com.local.coursely.widget.WidgetStore
import com.local.coursely.widget.WidgetUpdater
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 网页 ↔ 原生的唯一桥。协议见 BRIDGE-CONTRACT.md。
 *
 * 线程模型：
 * - [req] 由 WebView 的 JS bridge 线程调用，可以阻塞，但不能做重活；
 * - 图片解码 / 提醒排程在 [io] 单线程池里做，OCR 有自己线程（OcrEngine）；
 * - 回执统一走 [resolve] → [NativeHost.evaluateJs]（宿主内部切主线程）。
 */
class NativeBridge(private val host: NativeHost) {

    companion object {
        const val VERSION = "0.1.0"

        /** 与契约 4.1 一致的请求码 */
        const val REQ_CAMERA = 0x501
        const val REQ_GALLERY = 0x502
        const val REQ_NOTIFY = 0x503

        private const val TAG = "NativeBridge"
    }

    private val appContext: Context = host.activity().applicationContext
    private val picker = PhotoPicker(appContext)
    private val ocr = OcrEngine()

    private val io = Executors.newSingleThreadExecutor { r ->
        Thread(r, "coursely-io").apply { isDaemon = true }
    }

    private val disposed = AtomicBoolean(false)
    private val lock = Any()

    /** 同一时刻只允许一个未完成的 pickPhoto（新请求顶掉旧请求） */
    private var pendingPickId: String? = null

    /** 同一时刻只允许一个未完成的 requestNotifications */
    private var pendingNotifyId: String? = null

    /* ── 网页入口 ─────────────────────────────────────────── */

    @JavascriptInterface
    fun req(id: String, method: String, payload: String) {
        val p = try {
            if (payload.isBlank()) JSONObject() else JSONObject(payload)
        } catch (t: Throwable) {
            JSONObject()
        }
        try {
            when (method) {
                "vibrate" -> handleVibrate(id, p)
                "setStatusBar" -> handleSetStatusBar(id, p)
                "pickPhoto" -> handlePickPhoto(id, p)
                "ocr" -> handleOcr(id, p)
                "syncReminders" -> handleSyncReminders(id, p)
                "requestNotifications" -> handleRequestNotifications(id)
                "syncWidget" -> handleSyncWidget(id, p)
                else -> resolve(id, false, errorJson("unknown_method"))
            }
        } catch (t: Throwable) {
            // 任何未预料的异常都不能穿过 JS bridge（会直接抛到 WebView 线程）
            Log.w(TAG, "req($method) failed", t)
            resolve(id, false, errorJson("internal_error"))
        }
    }

    @JavascriptInterface
    fun info(): String = try {
        JSONObject().apply {
            put("platform", "android")
            put("version", VERSION)
            put("sdk", Build.VERSION.SDK_INT)
            put("device", Build.MODEL ?: "android")
            put("ocr", true)
            put("notifications", Notifications.permissionState(appContext))
        }.toString()
    } catch (t: Throwable) {
        """{"platform":"android","version":"$VERSION","sdk":${Build.VERSION.SDK_INT},"device":"android","ocr":true,"notifications":"granted"}"""
    }

    /* ── vibrate / setStatusBar ───────────────────────────── */

    private fun handleVibrate(id: String, payload: JSONObject) {
        val ms = payload.optLong("ms", 8L).coerceIn(1L, 2000L)
        try {
            val activity = host.activity()
            val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (t: Throwable) {
            Log.w(TAG, "vibrate failed", t)
        }
        resolve(id, true, "{}")
    }

    private fun handleSetStatusBar(id: String, payload: JSONObject) {
        val dark = payload.optBoolean("dark", false)
        val activity = host.activity()
        activity.runOnUiThread {
            try {
                val window = activity.window
                val controller = WindowInsetsControllerCompat(window, window.decorView)
                controller.isAppearanceLightStatusBars = !dark
                controller.isAppearanceLightNavigationBars = !dark
                @Suppress("DEPRECATION")
                run {
                    window.statusBarColor = ContextCompat.getColor(
                        activity,
                        if (dark) R.color.status_bar_night else R.color.status_bar
                    )
                    window.navigationBarColor = ContextCompat.getColor(
                        activity,
                        if (dark) R.color.app_bg_night else R.color.app_bg
                    )
                }
            } catch (t: Throwable) {
                Log.w(TAG, "setStatusBar failed", t)
            }
            resolve(id, true, "{}")
        }
    }

    /* ── pickPhoto ────────────────────────────────────────── */

    private fun handlePickPhoto(id: String, payload: JSONObject) {
        if (disposed.get()) {
            resolve(id, false, errorJson("cancel"))
            return
        }
        val source = payload.optString("source", "camera")
        val superseded = synchronized(lock) {
            val previous = pendingPickId
            pendingPickId = id
            previous
        }
        if (superseded != null && superseded != id) {
            resolve(superseded, false, errorJson("cancel"))
        }

        val activity = host.activity()
        if (activity.isFinishing || activity.isDestroyed) {
            clearPendingPick(id)
            resolve(id, false, errorJson("cancel"))
            return
        }

        activity.runOnUiThread {
            try {
                if (source == "gallery") {
                    activity.startActivityForResult(picker.galleryIntent(), REQ_GALLERY)
                } else {
                    activity.startActivityForResult(picker.cameraIntent(), REQ_CAMERA)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "start pickPhoto($source) failed", t)
                clearPendingPick(id)
                resolve(id, false, errorJson(if (source == "gallery") "no_gallery" else "no_camera"))
            }
        }
    }

    /** MainActivity.onActivityResult 转发进来；返回 true 表示已消费。 */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQ_CAMERA && requestCode != REQ_GALLERY) return false

        val id = synchronized(lock) {
            val current = pendingPickId
            pendingPickId = null
            current
        }
        if (id == null) {
            picker.clearPending()
            return true
        }
        if (resultCode != Activity.RESULT_OK) {
            picker.clearPending()
            resolve(id, false, errorJson("cancel"))
            return true
        }

        val uri = try {
            if (requestCode == REQ_CAMERA) {
                picker.cameraResultUri(resultCode)
            } else {
                picker.galleryResultUri(resultCode, data)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "read pickPhoto result failed", t)
            null
        }
        if (uri == null) {
            picker.clearPending()
            resolve(id, false, errorJson("decode_failed"))
            return true
        }

        val context = appContext
        try {
            io.execute {
                try {
                    val bitmap = ImageUtils.loadScaled(context, uri, ImageUtils.MAX_SIDE)
                    if (bitmap == null) {
                        resolve(id, false, errorJson("decode_failed"))
                    } else {
                        val receipt = JSONObject()
                            .put("dataUrl", ImageUtils.toDataUrl(bitmap))
                            .put("width", bitmap.width)
                            .put("height", bitmap.height)
                            .toString()
                        resolve(id, true, receipt)
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "decode picked photo failed", t)
                    resolve(id, false, errorJson("decode_failed"))
                } finally {
                    picker.clearPending(deleteCameraFile = requestCode == REQ_CAMERA)
                }
            }
        } catch (t: Throwable) {
            picker.clearPending()
            resolve(id, false, errorJson("decode_failed"))
        }
        return true
    }

    private fun clearPendingPick(id: String) {
        synchronized(lock) {
            if (pendingPickId == id) pendingPickId = null
        }
        picker.clearPending()
    }

    /* ── ocr ──────────────────────────────────────────────── */

    private fun handleOcr(id: String, payload: JSONObject) {
        val dataUrl = payload.optString("dataUrl", "")
        if (dataUrl.isEmpty()) {
            resolve(id, false, errorJson("decode_failed"))
            return
        }
        try {
            ocr.recognize(dataUrl) { outcome ->
                when (outcome) {
                    is OcrOutcome.Success -> resolve(id, true, ocrReceipt(outcome))
                    is OcrOutcome.Failure -> resolve(id, false, errorJson(outcome.code))
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "ocr failed", t)
            resolve(id, false, errorJson("ocr_failed"))
        }
    }

    private fun ocrReceipt(success: OcrOutcome.Success): String {
        val lines = JSONArray()
        for (line in success.lines) {
            lines.put(
                JSONObject()
                    .put("text", line.text)
                    .put("x", OcrNormalizer.round4(line.x))
                    .put("y", OcrNormalizer.round4(line.y))
                    .put("w", OcrNormalizer.round4(line.w))
                    .put("h", OcrNormalizer.round4(line.h))
                    .put("size", line.size)
            )
        }
        return JSONObject()
            .put("width", success.width)
            .put("height", success.height)
            .put("lines", lines)
            .toString()
    }

    /* ── syncReminders ────────────────────────────────────── */

    private fun handleSyncReminders(id: String, payload: JSONObject) {
        val items = ReminderLogic.parseItems(payload.optJSONArray("items"))
        try {
            io.execute {
                try {
                    val result = ReminderScheduler(appContext).sync(items)
                    resolve(id, true, result.toJson())
                } catch (t: Throwable) {
                    Log.w(TAG, "syncReminders failed", t)
                    resolve(id, false, errorJson("internal_error"))
                }
            }
        } catch (t: Throwable) {
            resolve(id, false, errorJson("internal_error"))
        }
    }

    /* ── requestNotifications ─────────────────────────────── */

    private fun handleRequestNotifications(id: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolve(id, true, """{"granted":true}""")
            return
        }
        val activity = host.activity()
        val granted = try {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } catch (t: Throwable) {
            false
        }
        if (granted) {
            Notifications.recordPermissionResult(activity, true)
            resolve(id, true, """{"granted":true}""")
            return
        }

        val superseded = synchronized(lock) {
            val previous = pendingNotifyId
            pendingNotifyId = id
            previous
        }
        if (superseded != null && superseded != id) {
            resolve(superseded, true, """{"granted":false}""")
        }

        activity.runOnUiThread {
            try {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQ_NOTIFY
                )
            } catch (t: Throwable) {
                Log.w(TAG, "requestPermissions failed", t)
                synchronized(lock) {
                    if (pendingNotifyId == id) pendingNotifyId = null
                }
                resolve(id, true, """{"granted":false}""")
            }
        }
    }

    /** MainActivity.onRequestPermissionsResult 转发进来；返回 true 表示该请求码由 bridge 消费。 */
    @Suppress("UNUSED_PARAMETER") // permissions 由 Activity 签名固定，bridge 只关心请求码与结果
    fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ): Boolean {
        if (requestCode != REQ_NOTIFY) return false
        val id = synchronized(lock) {
            val current = pendingNotifyId
            pendingNotifyId = null
            current
        }
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        try {
            Notifications.recordPermissionResult(appContext, granted)
        } catch (t: Throwable) {
            Log.w(TAG, "record permission result failed", t)
        }
        if (id != null) {
            resolve(id, true, JSONObject().put("granted", granted).toString())
        }
        return true
    }

    /* ── 桌面小组件同步 ───────────────────────────────────── */

    /**
     * 网页把「未来 14 天的课程事件（绝对时间戳）」推过来。
     * 小组件是独立进程，读不到 WebView 的 localStorage，所以必须在原生侧留一份。
     */
    private fun handleSyncWidget(id: String, payload: JSONObject) {
        val events = payload.optJSONArray("events")
        val count = events?.length() ?: 0
        try {
            WidgetStore.save(appContext, payload.toString())
        } catch (t: Throwable) {
            Log.w(TAG, "save widget payload failed", t)
            resolve(id, false, errorJson("store_failed"))
            return
        }
        // 立刻重绘（App 可能正开着，用户刚改完课表就该看到变化）
        io.execute {
            try {
                WidgetUpdater.refreshAll(appContext)
            } catch (t: Throwable) {
                Log.w(TAG, "refresh widgets failed", t)
            }
        }
        resolve(id, true, JSONObject().put("ok", true).put("events", count).toString())
    }

    /* ── 生命周期 ─────────────────────────────────────────── */

    fun dispose() {
        if (!disposed.compareAndSet(false, true)) return
        val pending = synchronized(lock) {
            val pick = pendingPickId
            val notify = pendingNotifyId
            pendingPickId = null
            pendingNotifyId = null
            pick to notify
        }
        pending.first?.let { resolve(it, false, errorJson("cancel")) }
        pending.second?.let { resolve(it, true, """{"granted":false}""") }
        try {
            picker.clearPending()
        } catch (t: Throwable) {
            // ignore
        }
        try {
            ocr.dispose()
        } catch (t: Throwable) {
            Log.w(TAG, "ocr dispose failed", t)
        }
        try {
            io.shutdown()
        } catch (t: Throwable) {
            // ignore
        }
    }

    /* ── 内部工具 ─────────────────────────────────────────── */

    /**
     * 回执给网页。json 必须是一段合法 JSON 文本。
     * ok=false 时建议 json 带 {"code":"..."}。
     */
    internal fun resolve(id: String, ok: Boolean, json: String) {
        if (id.isEmpty()) return
        try {
            val quotedId = JSONObject.quote(id)
            val quotedJson = JSONObject.quote(json)
            host.evaluateJs("window.CN && window.CN._resolve($quotedId, $ok, $quotedJson);")
        } catch (t: Throwable) {
            Log.w(TAG, "resolve failed", t)
        }
    }

    private fun errorJson(code: String): String = try {
        JSONObject().put("code", code).toString()
    } catch (t: Throwable) {
        """{"code":"$code"}"""
    }
}
