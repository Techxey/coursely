package com.local.coursely.widget

import android.content.Context

/**
 * 小组件数据的本机存储。
 * 网页（WebView）里拿不到 localStorage 之外的东西，所以由网页在数据变化时把
 * 「未来 14 天的课程事件（绝对时间戳）」推给原生，存在这里；小组件与桌面随时可读，
 * App 没打开也能显示正确的「今天 / 下节课」。
 */
object WidgetStore {

    private const val PREFS = "coursely_widget"
    private const val KEY = "events_json"

    fun save(context: Context, eventsJson: String) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY, eventsJson)
                .apply()
        } catch (t: Throwable) {
            // 存储失败不能影响网页
        }
    }

    fun loadJson(context: Context): String? = try {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
    } catch (t: Throwable) {
        null
    }

    fun load(context: Context): List<WidgetEvent> = WidgetData.parse(loadJson(context))
}
