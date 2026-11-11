package com.local.coursely.widget

import com.local.coursely.R
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** 一次课（绝对时间戳，由网页推算好推过来；小组件不依赖 WebView 也能用） */
data class WidgetEvent(
    val name: String,
    val room: String,
    val startMs: Long,
    val endMs: Long,
    val tone: Int
)

/** 下节课卡片的展示模型 */
data class NextInfo(
    val eyebrow: String,
    val name: String,
    val meta: String,
    /** true 时用 Chronometer 倒计时到 countdownTo（原生自走，不用每分钟唤醒） */
    val useCountdown: Boolean,
    val countdownTo: Long,
    /** useCountdown=false 时显示的静态文字 */
    val staticText: String
)

/**
 * 小组件的全部纯逻辑：解析 / 取今天的课 / 取下一节课 / 文案。
 * 不碰 Context、不碰 RemoteViews —— 这样可以被单元测试完整覆盖。
 */
object WidgetData {

    /**
     * 4×2 小组件可用高度约 150dp：扣掉 padding 28 + 标题 18，
     * 双行文本（课程名 + 教室）每行约 32dp，稳妥只放 3 行，多的用「+N 节课」提示。
     * 放 4 行在多数 launcher 上会被裁掉第 4 行的教室文字。
     */
    const val MAX_ROWS = 3

    private val HM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    private val MD: DateTimeFormatter = DateTimeFormatter.ofPattern("M月d日")
    private val WEEK_CN = arrayOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

    private fun zone(): ZoneId = ZoneId.systemDefault()

    /* ── 解析网页推过来的 JSON ─────────────────────────────── */

    fun parse(json: String?): List<WidgetEvent> {
        if (json.isNullOrBlank()) return emptyList()
        return try {
            val arr = JSONObject(json).optJSONArray("events") ?: JSONArray()
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val name = o.optString("name").trim()
                    if (name.isEmpty()) continue
                    val s = o.optLong("startMs", 0L)
                    val e = o.optLong("endMs", 0L)
                    if (s <= 0L || e <= s) continue
                    add(
                        WidgetEvent(
                            name = name,
                            room = o.optString("room").trim(),
                            startMs = s,
                            endMs = e,
                            tone = o.optInt("tone", 2).coerceIn(1, 8)
                        )
                    )
                }
            }
        } catch (t: Throwable) {
            emptyList()
        }
    }

    /* ── 时间工具 ─────────────────────────────────────────── */

    fun startOfDay(ms: Long): Long =
        Instant.ofEpochMilli(ms).atZone(zone()).toLocalDate()
            .atStartOfDay(zone()).toInstant().toEpochMilli()

    fun dateOf(ms: Long): LocalDate = Instant.ofEpochMilli(ms).atZone(zone()).toLocalDate()

    fun fmtTime(ms: Long): String = Instant.ofEpochMilli(ms).atZone(zone()).format(HM)

    fun fmtDate(ms: Long): String = Instant.ofEpochMilli(ms).atZone(zone()).format(MD)

    fun weekdayCn(ms: Long): String = WEEK_CN[dateOf(ms).dayOfWeek.value - 1]

    /* ── 今天的课 ─────────────────────────────────────────── */

    fun todayEvents(events: List<WidgetEvent>, nowMs: Long): List<WidgetEvent> {
        val s = startOfDay(nowMs)
        val e = s + 86_400_000L
        return events.filter { it.startMs >= s && it.startMs < e }.sortedBy { it.startMs }
    }

    /** 下一节课：正在进行的那节也算（endMs 还没到） */
    fun nextEvent(events: List<WidgetEvent>, nowMs: Long): WidgetEvent? =
        events.asSequence().filter { it.endMs > nowMs }.minByOrNull { it.startMs }

    fun isOngoing(e: WidgetEvent, nowMs: Long): Boolean = e.startMs <= nowMs && nowMs < e.endMs

    /* ── 下节课卡片文案 ───────────────────────────────────── */

    /** 2 小时以内的才用秒级倒计时，更远的直接给静态时间，避免显示 23:41:07 这种*/
    const val COUNTDOWN_WINDOW_MS = 2 * 60 * 60 * 1000L

    fun nextInfo(e: WidgetEvent?, nowMs: Long, emptyText: String = "没有更多课了"): NextInfo {
        if (e == null) {
            return NextInfo(
                eyebrow = "下一节课",
                name = emptyText,
                meta = "打开课序看看后面的安排",
                useCountdown = false,
                countdownTo = 0L,
                staticText = "—"
            )
        }

        val name = e.name
        val meta = buildString {
            if (e.room.isNotEmpty()) {
                append(e.room)
                append(" · ")
            }
            append(fmtTime(e.startMs))
            append("–")
            append(fmtTime(e.endMs))
        }

        if (isOngoing(e, nowMs)) {
            val remaining = e.endMs - nowMs
            return NextInfo(
                eyebrow = "正在上课",
                name = name,
                meta = meta,
                useCountdown = remaining <= COUNTDOWN_WINDOW_MS,
                countdownTo = e.endMs,
                staticText = "剩余 ${minutesText(remaining)}"
            )
        }

        val until = e.startMs - nowMs
        val dayDiff = ((startOfDay(e.startMs) - startOfDay(nowMs)) / 86_400_000L).toInt()
        val eyebrow = when {
            dayDiff == 0 && until <= 60 * 60 * 1000L -> "还有 ${maxOf(1, until / 60_000L)} 分钟"
            dayDiff == 0 -> "今天 ${fmtTime(e.startMs)}"
            dayDiff == 1 -> "明天 ${fmtTime(e.startMs)}"
            else -> "${weekdayCn(e.startMs)} ${fmtTime(e.startMs)}"
        }
        return NextInfo(
            eyebrow = eyebrow,
            name = name,
            meta = meta,
            useCountdown = until <= COUNTDOWN_WINDOW_MS,
            countdownTo = e.startMs,
            staticText = if (dayDiff == 0) fmtTime(e.startMs) else weekdayCn(e.startMs)
        )
    }

    fun minutesText(ms: Long): String {
        val totalSec = maxOf(0L, ms / 1000L)
        val m = totalSec / 60L
        val s = totalSec % 60L
        return "${m}:${if (s < 10) "0$s" else "$s"}"
    }

    /* ── 配色（与 App 的 8 色课程色板一致） ───────────────── */

    fun toneColorRes(tone: Int): Int = when (tone) {
        1 -> R.color.wg_tone1
        2 -> R.color.wg_tone2
        3 -> R.color.wg_tone3
        4 -> R.color.wg_tone4
        5 -> R.color.wg_tone5
        6 -> R.color.wg_tone6
        7 -> R.color.wg_tone7
        else -> R.color.wg_tone8
    }

    /* ── 下次刷新时间的计算（也做纯函数，方便测） ─────────── */

    /**
     * 下一次必须刷新的时刻：
     * - 午夜（"今天"要换成新的一天）
     * - 下一节课的开始 / 结束（倒计时与"进行中"状态要切换）
     * - 没有事件时：明天 0 点
     */
    fun nextRefreshAt(events: List<WidgetEvent>, nowMs: Long): Long {
        val midnight = startOfDay(nowMs) + 86_400_000L
        var at = midnight
        val next = nextEvent(events, nowMs)
        if (next != null) {
            val boundary = if (next.startMs > nowMs) next.startMs else next.endMs
            if (boundary > nowMs) at = minOf(at, boundary)
        }
        return if (at <= nowMs) nowMs + 60_000L else at
    }
}
