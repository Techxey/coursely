package com.local.coursely.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.local.coursely.MainActivity
import com.local.coursely.R

/** 把 WidgetData 渲染成 RemoteViews（只做视图，不做数据逻辑） */
object WidgetRenderer {

    private val ROW_IDS = intArrayOf(R.id.wg_row1, R.id.wg_row2, R.id.wg_row3, R.id.wg_row4)
    private val TIME_IDS = intArrayOf(R.id.wg_time1, R.id.wg_time2, R.id.wg_time3, R.id.wg_time4)
    private val BAR_IDS = intArrayOf(R.id.wg_bar1, R.id.wg_bar2, R.id.wg_bar3, R.id.wg_bar4)
    private val NAME_IDS = intArrayOf(R.id.wg_name1, R.id.wg_name2, R.id.wg_name3, R.id.wg_name4)
    private val ROOM_IDS = intArrayOf(R.id.wg_room1, R.id.wg_room2, R.id.wg_room3, R.id.wg_room4)

    /* ── 今日课表（4×2） ──────────────────────────────────── */

    fun today(context: Context, events: List<WidgetEvent>, nowMs: Long): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_today)
        val today = WidgetData.todayEvents(events, nowMs)

        v.setTextViewText(
            R.id.wg_date,
            context.getString(R.string.wg_today) + " · " + WidgetData.fmtDate(nowMs)
        )
        v.setTextViewText(R.id.wg_count, if (today.isEmpty()) "" else "${today.size} 节课")

        for (i in ROW_IDS.indices) {
            if (i < today.size) {
                val e = today[i]
                val ongoing = WidgetData.isOngoing(e, nowMs)
                val finished = e.endMs <= nowMs

                v.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                v.setTextViewText(TIME_IDS[i], WidgetData.fmtTime(e.startMs))
                v.setTextViewText(NAME_IDS[i], e.name)
                v.setTextViewText(ROOM_IDS[i], buildString {
                    if (e.room.isNotEmpty()) append(e.room)
                    if (ongoing) {
                        if (isNotEmpty()) append(" · ")
                        append("进行中")
                    } else if (finished) {
                        if (isNotEmpty()) append(" · ")
                        append("已结束")
                    }
                })
                v.setInt(BAR_IDS[i], "setBackgroundColor", context.getColor(WidgetData.toneColorRes(e.tone)))
                v.setTextColor(
                    NAME_IDS[i],
                    context.getColor(if (finished) R.color.wg_label2 else R.color.wg_label)
                )
                v.setTextColor(
                    ROOM_IDS[i],
                    context.getColor(if (ongoing) R.color.wg_now else R.color.wg_label2)
                )
            } else {
                v.setViewVisibility(ROW_IDS[i], View.GONE)
            }
        }

        when {
            events.isEmpty() -> {
                v.setViewVisibility(R.id.wg_empty, View.VISIBLE)
                v.setTextViewText(R.id.wg_empty, context.getString(R.string.wg_need_sync))
            }
            today.isEmpty() -> {
                v.setViewVisibility(R.id.wg_empty, View.VISIBLE)
                v.setTextViewText(R.id.wg_empty, context.getString(R.string.wg_today_empty))
            }
            else -> v.setViewVisibility(R.id.wg_empty, View.GONE)
        }

        val more = today.size - WidgetData.MAX_ROWS
        if (more > 0) {
            v.setViewVisibility(R.id.wg_footer, View.VISIBLE)
            v.setTextViewText(R.id.wg_footer, "+$more 节课")
        } else {
            v.setViewVisibility(R.id.wg_footer, View.GONE)
        }

        v.setOnClickPendingIntent(R.id.wg_root, openApp(context, 1))
        return v
    }

    /* ── 下节课倒计时（2×2） ──────────────────────────────── */

    fun next(context: Context, events: List<WidgetEvent>, nowMs: Long): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_next)
        val info = WidgetData.nextInfo(WidgetData.nextEvent(events, nowMs), nowMs)

        v.setTextViewText(R.id.wn_eyebrow, info.eyebrow)
        v.setTextViewText(R.id.wn_name, info.name)
        v.setTextViewText(R.id.wn_meta, info.meta)

        if (info.useCountdown && info.countdownTo > nowMs) {
            // Chronometer 自己走秒，不用每分钟唤醒 App / 发广播
            v.setViewVisibility(R.id.wn_clock, View.VISIBLE)
            v.setViewVisibility(R.id.wn_when, View.GONE)
            v.setChronometer(R.id.wn_clock, info.countdownTo, null, true)
            v.setChronometerCountDown(R.id.wn_clock, true)
        } else {
            v.setViewVisibility(R.id.wn_clock, View.GONE)
            v.setViewVisibility(R.id.wn_when, View.VISIBLE)
            v.setTextViewText(R.id.wn_when, info.staticText)
        }

        v.setOnClickPendingIntent(R.id.wn_root, openApp(context, 2))
        return v
    }

    private fun openApp(context: Context, code: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            context,
            code,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
