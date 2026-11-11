package com.local.coursely.reminder

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.local.coursely.MainActivity
import com.local.coursely.R

/**
 * 通知渠道 + 发通知 + POST_NOTIFICATIONS 权限状态。
 *
 * 没有 appcompat 依赖，所以用平台 [Notification.Builder]（minSdk 26，channel 构造可用）。
 */
object Notifications {

    const val CHANNEL_ID = "reminders"
    const val CHANNEL_NAME = "上课与作业提醒"
    private const val CHANNEL_DESC = "课程开始与作业截止前的提醒"
    private const val PREFS = "coursely_notifications"
    private const val KEY_DENIED = "post_notifications_denied"
    private const val TAG = "Notifications"

    /** 幂等创建渠道（IMPORTANCE_HIGH）。 */
    fun ensureChannel(context: Context) {
        try {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (manager.getNotificationChannel(CHANNEL_ID) != null) return
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = CHANNEL_DESC
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0L, 120L, 80L, 120L)
                    setShowBadge(true)
                    lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                }
                manager.createNotificationChannel(channel)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "ensureChannel failed", t)
        }
    }

    /**
     * 发一条提醒通知。
     * @param notificationId 稳定 id（同一提醒重复发会覆盖而不是刷屏）
     */
    fun show(context: Context, notificationId: Int, title: String, body: String) {
        try {
            ensureChannel(context)
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return
            val launch = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val contentIntent = PendingIntent.getActivity(
                context,
                0,
                launch,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val builder = Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis())
            manager.notify(notificationId, builder.build())
        } catch (t: Throwable) {
            // 权限被拒 / 通知被系统关闭：静默失败，不能影响闹钟回调
            Log.w(TAG, "show notification failed", t)
        }
    }

    /** `info()` 里的 notifications 字段：granted | denied | default（<13 恒 granted）。 */
    fun permissionState(context: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted"
        val granted = try {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } catch (t: Throwable) {
            false
        }
        if (granted) return "granted"
        return if (prefs(context).getBoolean(KEY_DENIED, false)) "denied" else "default"
    }

    /** 记录用户对 POST_NOTIFICATIONS 的选择，用来区分 denied / default。 */
    fun recordPermissionResult(context: Context, granted: Boolean) {
        try {
            prefs(context).edit().putBoolean(KEY_DENIED, !granted).apply()
        } catch (t: Throwable) {
            Log.w(TAG, "recordPermissionResult failed", t)
        }
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
