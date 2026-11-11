package com.local.coursely.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 闹钟到点 → 弹通知。
 * 由 ReminderScheduler 用 PendingIntent.getBroadcast(...) 触发（见 AndroidManifest 的 receiver 声明）。
 */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null) return
        try {
            val id = intent.getStringExtra(ReminderScheduler.EXTRA_ID).orEmpty()
            val title = intent.getStringExtra(ReminderScheduler.EXTRA_TITLE)
                ?.takeIf { it.isNotBlank() }
                ?: ReminderLogic.DEFAULT_TITLE
            val body = intent.getStringExtra(ReminderScheduler.EXTRA_BODY).orEmpty()
            val notificationId = if (id.isNotEmpty()) {
                id.hashCode()
            } else {
                (System.currentTimeMillis() and Int.MAX_VALUE.toLong()).toInt()
            }
            Notifications.show(context, notificationId, title, body)
        } catch (t: Throwable) {
            // Receiver 里抛异常会 ANR / 闪退，一律吞掉
            Log.w(TAG, "onReceive failed", t)
        }
    }

    companion object {
        private const val TAG = "ReminderReceiver"
    }
}
