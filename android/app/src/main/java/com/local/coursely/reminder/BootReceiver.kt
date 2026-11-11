package com.local.coursely.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 开机 / 应用更新后恢复提醒。
 *
 * 网页数据在 localStorage 里这时取不到，所以读 ReminderScheduler 在每次 sync 时
 * 落盘到 SharedPreferences（`reminders.json`）的缓存重新排。
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in HANDLED_ACTIONS) return
        try {
            ReminderScheduler(context).restoreFromCache()
        } catch (t: Throwable) {
            Log.w(TAG, "restore reminders failed", t)
        }
    }

    private companion object {
        const val TAG = "BootReceiver"

        val HANDLED_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.LOCKED_BOOT_COMPLETED",
            "android.intent.action.QUICKBOOT_POWERON"
        )
    }
}
