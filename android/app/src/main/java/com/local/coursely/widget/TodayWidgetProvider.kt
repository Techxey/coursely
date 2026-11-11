package com.local.coursely.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/** 今日课表小组件（4×2）：今天的课 + 教室，进行中的标注「进行中」 */
class TodayWidgetProvider : AppWidgetProvider() {

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
        // 没有实例了就取消提醒，省电
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
