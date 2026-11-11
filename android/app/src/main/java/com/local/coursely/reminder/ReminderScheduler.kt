package com.local.coursely.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** 一条提醒（字段与网页侧约定一致）。 */
data class ReminderItem(
    val id: String,
    val atMs: Long,
    val title: String,
    val body: String
)

/** `syncReminders` 的回执。 */
data class SyncResult(val scheduled: Int, val exact: Boolean) {
    fun toJson(): String = try {
        JSONObject().put("scheduled", scheduled).put("exact", exact).toString()
    } catch (t: Throwable) {
        """{"scheduled":$scheduled,"exact":$exact}"""
    }
}

/**
 * 提醒的纯逻辑（不碰 Android API，单测直接覆盖）：
 * requestCode 分配、去重、过滤过去时间、payload / 缓存 JSON 解析。
 */
object ReminderLogic {

    /** 上限与网页侧一致：最多排 200 条。 */
    const val MAX_ITEMS = 200

    /**
     * id → PendingIntent requestCode。
     * 同一 id 恒定得到同一个值（稳定），不同 id 撞哈希时用确定性重哈希线性探测，
     * 保证同一轮里每个 id 的 requestCode 互不相同（否则 PendingIntent 会互相覆盖）。
     */
    fun assignRequestCodes(ids: List<String>): Map<String, Int> {
        val used = HashSet<Int>()
        val out = LinkedHashMap<String, Int>()
        for (id in ids) {
            if (out.containsKey(id)) continue
            var code = id.hashCode()
            var guard = 0
            while (!used.add(code) && guard < 1000) {
                code = code * 31 + 0x9E3779B1.toInt()
                guard++
            }
            out[id] = code
        }
        return out
    }

    /** 按 id 去重（保留最后一次出现的值，顺序按首次出现）。 */
    fun dedupeById(items: List<ReminderItem>): List<ReminderItem> {
        val map = LinkedHashMap<String, ReminderItem>()
        for (item in items) map[item.id] = item
        return map.values.toList()
    }

    /** 去重 + 去掉已经过去的时间，按时间升序 + 截断 MAX_ITEMS。 */
    fun futureItems(items: List<ReminderItem>, nowMs: Long): List<ReminderItem> =
        dedupeById(items)
            .filter { it.atMs > nowMs }
            .sortedBy { it.atMs }
            .take(MAX_ITEMS)

    /** 解析网页传来的 items 数组（非法项直接跳过）。 */
    fun parseItems(array: JSONArray?): List<ReminderItem> {
        if (array == null || array.length() == 0) return emptyList()
        val out = ArrayList<ReminderItem>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            val id = obj.optString("id", "").trim()
            val atMs = obj.optLong("atMs", 0L)
            if (id.isEmpty() || atMs <= 0L) continue
            val title = obj.optString("title", "").trim().ifEmpty { DEFAULT_TITLE }
            val body = obj.optString("body", "")
            out.add(ReminderItem(id, atMs, title, body))
            if (out.size >= MAX_ITEMS) break
        }
        return out
    }

    const val DEFAULT_TITLE = "课序提醒"
}

/**
 * 提醒缓存（SharedPreferences）。sync 时把本轮 items 落盘，BootReceiver 开机后读它重排。
 * key 用契约里写的 `reminders.json`。
 */
object ReminderStore {

    const val PREFS_NAME = "coursely_reminders"
    const val KEY_STATE = "reminders.json"
    private const val VERSION = 1

    fun save(context: Context, codes: Map<String, Int>, items: List<ReminderItem>) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_STATE, toJson(codes, items))
                .apply()
        } catch (t: Throwable) {
            Log.w(TAG, "save reminders failed", t)
        }
    }

    /** 读出上次排程的 (requestCode 表, items)。坏数据一律当空处理。 */
    fun load(context: Context): Pair<Map<String, Int>, List<ReminderItem>> {
        val raw = try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_STATE, null)
        } catch (t: Throwable) {
            null
        }
        return fromJson(raw)
    }

    fun toJson(codes: Map<String, Int>, items: List<ReminderItem>): String {
        val codesJson = JSONObject()
        codes.forEach { (id, code) -> codesJson.put(id, code) }
        val itemsJson = JSONArray()
        items.forEach { item ->
            itemsJson.put(
                JSONObject()
                    .put("id", item.id)
                    .put("atMs", item.atMs)
                    .put("title", item.title)
                    .put("body", item.body)
            )
        }
        return JSONObject()
            .put("v", VERSION)
            .put("codes", codesJson)
            .put("items", itemsJson)
            .toString()
    }

    fun fromJson(raw: String?): Pair<Map<String, Int>, List<ReminderItem>> {
        if (raw.isNullOrEmpty()) return emptyMap<String, Int>() to emptyList()
        return try {
            val root = JSONObject(raw)
            val codes = LinkedHashMap<String, Int>()
            root.optJSONObject("codes")?.let { obj ->
                val keys = obj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    codes[key] = obj.optInt(key, Int.MIN_VALUE)
                }
            }
            val items = ReminderLogic.parseItems(root.optJSONArray("items"))
            codes to items
        } catch (t: Throwable) {
            emptyMap<String, Int>() to emptyList()
        }
    }

    private const val TAG = "ReminderStore"
}

/**
 * AlarmManager 排程。全部用一次性闹钟（RTC_WAKEUP），每次 sync 先取消上一轮再重排。
 *
 * 精确闹钟：API 31+ 需要 `canScheduleExactAlarms()`（用户在系统设置里允许后才能用），
 * 能用就 `setExactAndAllowWhileIdle`，不能用 / 抛 SecurityException 就降级
 * `setAndAllowWhileIdle`，回执的 exact 如实反映本轮是否全部精确。
 */
class ReminderScheduler(private val context: Context) {

    companion object {
        const val ACTION_REMINDER = "com.local.coursely.reminder.ACTION_REMINDER"
        const val EXTRA_ID = "reminder_id"
        const val EXTRA_TITLE = "reminder_title"
        const val EXTRA_BODY = "reminder_body"
        private const val TAG = "ReminderScheduler"
    }

    /**
     * 按本轮 items 重排全部提醒。
     * @return 实际排上的条数 + 是否全部精确
     */
    fun sync(items: List<ReminderItem>, nowMs: Long = System.currentTimeMillis()): SyncResult {
        Notifications.ensureChannel(context)
        val previous = ReminderStore.load(context)
        cancelAll(previous.first)

        val target = ReminderLogic.futureItems(items, nowMs)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        if (alarmManager == null) {
            ReminderStore.save(context, emptyMap(), emptyList())
            return SyncResult(0, false)
        }
        if (target.isEmpty()) {
            ReminderStore.save(context, emptyMap(), emptyList())
            return SyncResult(0, canScheduleExact())
        }

        val codes = ReminderLogic.assignRequestCodes(target.map { it.id })
        var exactAllowed = canScheduleExact()
        var scheduled = 0
        var exact = exactAllowed
        val applied = LinkedHashMap<String, Int>()

        for (item in target) {
            val code = codes[item.id] ?: continue
            val pi = buildPendingIntent(item, code, PendingIntent.FLAG_UPDATE_CURRENT) ?: continue
            var ok = false
            if (exactAllowed) ok = scheduleExact(alarmManager, item.atMs, pi)
            if (!ok) {
                ok = scheduleInexact(alarmManager, item.atMs, pi)
                if (ok) exact = false
            }
            if (ok) {
                scheduled++
                applied[item.id] = code
            }
        }

        // 精确权限本轮可能中途失效，最终以是否所有闹钟都精确为准
        if (scheduled == 0) exact = false
        ReminderStore.save(context, applied, target)
        Log.i(TAG, "sync: scheduled=$scheduled exact=$exact of ${target.size}")
        return SyncResult(scheduled, exact)
    }

    /** 开机 / 应用更新后：读缓存重新排（网页 localStorage 这时拿不到）。 */
    fun restoreFromCache(nowMs: Long = System.currentTimeMillis()): SyncResult {
        val cached = ReminderStore.load(context).second
        if (cached.isEmpty()) return SyncResult(0, canScheduleExact())
        return sync(cached, nowMs)
    }

    /** 取消上一轮排过的全部闹钟。 */
    private fun cancelAll(codes: Map<String, Int>) {
        if (codes.isEmpty()) return
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        for ((id, code) in codes) {
            try {
                val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION_REMINDER)
                val pi = PendingIntent.getBroadcast(
                    context,
                    code,
                    intent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE
                ) ?: continue
                alarmManager.cancel(pi)
                pi.cancel()
            } catch (t: Throwable) {
                Log.w(TAG, "cancel failed: $id", t)
            }
        }
    }

    private fun buildPendingIntent(item: ReminderItem, requestCode: Int, extraFlags: Int): PendingIntent? = try {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            action = ACTION_REMINDER
            putExtra(EXTRA_ID, item.id)
            putExtra(EXTRA_TITLE, item.title)
            putExtra(EXTRA_BODY, item.body)
        }
        PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE or extraFlags
        )
    } catch (t: Throwable) {
        Log.w(TAG, "PendingIntent failed: ${item.id}", t)
        null
    }

    /** API 31+ 需要「闹钟和提醒」特殊权限；低版本恒为 true。 */
    private fun canScheduleExact(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        return try {
            alarmManager.canScheduleExactAlarms()
        } catch (t: Throwable) {
            false
        }
    }

    private fun scheduleExact(alarmManager: AlarmManager, atMs: Long, pi: PendingIntent): Boolean = try {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
        true
    } catch (t: Throwable) {
        // SecurityException：用户事后收回了精确闹钟权限
        Log.w(TAG, "exact alarm denied, fallback to inexact", t)
        false
    }

    private fun scheduleInexact(alarmManager: AlarmManager, atMs: Long, pi: PendingIntent): Boolean = try {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
        true
    } catch (t: Throwable) {
        Log.w(TAG, "alarm scheduling failed", t)
        false
    }
}
