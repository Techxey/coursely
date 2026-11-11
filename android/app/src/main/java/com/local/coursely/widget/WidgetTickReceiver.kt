package com.local.coursely.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** AlarmManager 到点触发：重绘并排下一次（午夜 / 下节课开始或结束） */
class WidgetTickReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        try {
            WidgetUpdater.refreshAll(context.applicationContext)
        } catch (t: Throwable) {
            // 小组件刷新失败不能影响系统广播
        }
    }
}
