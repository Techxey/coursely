package com.local.coursely.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * 小组件刷新调度：
 * - 网页推了新课表 → 立刻重绘（refreshAll）
 * - 到「下一节课开始/结束」和「午夜」→ AlarmManager 唤醒重绘
 * - 倒计时的走秒由 RemoteViews 里的 Chronometer 自己完成，无需每秒唤醒
 */
object WidgetUpdater {

    const val ACTION_TICK = "com.local.coursely.WIDGET_TICK"
    private const val REQ_TICK = 0x7711

    fun refreshAll(context: Context) {
        val app = context.applicationContext
        val events = WidgetStore.load(app)
        val now = System.currentTimeMillis()
        updateToday(app, events, now)
        updateNext(app, events, now)
        scheduleNext(app, events, now)
    }

    fun updateToday(context: Context, events: List<WidgetEvent>, nowMs: Long) {
        val mgr = AppWidgetManager.getInstance(context) ?: return
        val ids = mgr.getAppWidgetIds(ComponentName(context, TodayWidgetProvider::class.java))
        if (ids.isEmpty()) return
        try {
            mgr.updateAppWidget(ids, WidgetRenderer.today(context, events, nowMs))
        } catch (t: Throwable) {
            // 桌面可能正在重启，忽略
        }
    }

    fun updateNext(context: Context, events: List<WidgetEvent>, nowMs: Long) {
        val mgr = AppWidgetManager.getInstance(context) ?: return
        val ids = mgr.getAppWidgetIds(ComponentName(context, NextWidgetProvider::class.java))
        if (ids.isEmpty()) return
        try {
            mgr.updateAppWidget(ids, WidgetRenderer.next(context, events, nowMs))
        } catch (t: Throwable) {
        }
    }

    fun scheduleNext(context: Context, events: List<WidgetEvent>, nowMs: Long) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val at = WidgetData.nextRefreshAt(events, nowMs)
        val pi = tickIntent(context)
        try {
            val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
            if (exact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.set(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (t: Throwable) {
            try {
                am.set(AlarmManager.RTC_WAKEUP, at, pi)
            } catch (ignored: Throwable) {
            }
        }
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        try {
            am.cancel(tickIntent(context))
        } catch (t: Throwable) {
        }
    }

    private fun tickIntent(context: Context): PendingIntent {
        val intent = Intent(context, WidgetTickReceiver::class.java).setAction(ACTION_TICK)
        return PendingIntent.getBroadcast(
            context,
            REQ_TICK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
