package com.local.coursely.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/** 下节课倒计时小组件（2×2）：2 小时内用 Chronometer 秒级倒计时，更远显示「明天 08:00」 */
class NextWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        WidgetUpdater.refreshAll(context)
    }

    override fun onEnabled(context: Context) {
        WidgetUpdater.refreshAll(context)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: android.os.Bundle
    ) {
        WidgetUpdater.refreshAll(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        val mgr = AppWidgetManager.getInstance(context)
        val todayIds = mgr.getAppWidgetIds(
            android.content.ComponentName(context, TodayWidgetProvider::class.java)
        )
        val nextIds = mgr.getAppWidgetIds(
            android.content.ComponentName(context, NextWidgetProvider::class.java)
        )
        if (todayIds.isEmpty() && nextIds.isEmpty()) {
            WidgetUpdater.cancel(context)
        }
    }
}
