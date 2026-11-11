package com.local.coursely.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * 小组件的纯逻辑测试（无需 Android 运行时）：
 * 解析、取今天的课、取下一节课、倒计时/静态文案的分界、下次刷新时刻。
 */
class WidgetDataTest {

    private val zone: ZoneId = ZoneId.systemDefault()

    /** 某天 hh:mm 的时间戳 */
    private fun at(date: LocalDate, hh: Int, mm: Int): Long =
        date.atTime(hh, mm).atZone(zone).toInstant().toEpochMilli()

    private fun day(s: String): LocalDate = LocalDate.parse(s)

    private fun ev(name: String, start: Long, end: Long, room: String = "教三-201", tone: Int = 2) =
        WidgetEvent(name, room, start, end, tone)

    private val today = day("2026-11-09")          // 周一
    private val tomorrow = today.plusDays(1)

    private fun sampleEvents(): List<WidgetEvent> = listOf(
        ev("数据结构与算法", at(today, 8, 0), at(today, 9, 40)),
        ev("大学英语", at(today, 10, 0), at(today, 11, 40), tone = 5),
        ev("操作系统", at(today, 14, 0), at(today, 15, 40), tone = 1),
        ev("计算机网络", at(today, 16, 0), at(today, 17, 40), tone = 6),
        ev("软件工程导论", at(today, 19, 0), at(today, 20, 40), tone = 7),
        ev("高等数学", at(tomorrow, 8, 0), at(tomorrow, 9, 40))
    )

    /* ── 今天的课 / 下一节课 ──────────────────────────────── */

    @Test
    fun todayEvents_only_today_sorted() {
        val list = WidgetData.todayEvents(sampleEvents(), at(today, 7, 0))
        assertEquals(5, list.size)
        assertEquals("数据结构与算法", list[0].name)
        assertEquals("软件工程导论", list[4].name)
    }

    @Test
    fun nextEvent_returns_ongoing_class_first() {
        // 08:30 时，正在上「数据结构」
        val e = WidgetData.nextEvent(sampleEvents(), at(today, 8, 30))
        assertNotNull(e)
        assertEquals("数据结构与算法", e!!.name)
        assertTrue(WidgetData.isOngoing(e, at(today, 8, 30)))
    }

    @Test
    fun nextEvent_crosses_midnight() {
        // 晚上 21:00 之后，下一节课是明天的高数
        val e = WidgetData.nextEvent(sampleEvents(), at(today, 21, 0))
        assertNotNull(e)
        assertEquals("高等数学", e!!.name)
        assertEquals(tomorrow, WidgetData.dateOf(e.startMs))
    }

    @Test
    fun nextEvent_null_when_all_past() {
        val list = listOf(ev("A", at(today, 8, 0), at(today, 9, 40)))
        assertNull(WidgetData.nextEvent(list, at(today, 12, 0)))
    }

    /* ── 文案 ─────────────────────────────────────────────── */

    @Test
    fun nextInfo_counts_down_within_two_hours() {
        val now = at(today, 7, 30)                       // 距 08:00 还有 30 分钟
        val info = WidgetData.nextInfo(WidgetData.nextEvent(sampleEvents(), now), now)
        assertTrue(info.useCountdown)
        assertFalse(info.eyebrow.isBlank())
        assertEquals("数据结构与算法", info.name)
        assertEquals(at(today, 8, 0), info.countdownTo)
        assertTrue("meta 应含教室", info.meta.contains("教三-201"))
    }

    @Test
    fun nextInfo_ongoing_counts_to_end() {
        val now = at(today, 8, 30)
        val info = WidgetData.nextInfo(WidgetData.nextEvent(sampleEvents(), now), now)
        assertTrue(info.useCountdown)
        assertEquals(at(today, 9, 40), info.countdownTo)   // 倒计时到下课
        assertTrue(info.eyebrow.contains("正在上课"))
    }

    @Test
    fun nextInfo_far_away_uses_static_text() {
        val now = at(today, 21, 0)                       // 明天的高数，>2h
        val info = WidgetData.nextInfo(WidgetData.nextEvent(sampleEvents(), now), now)
        assertFalse(info.useCountdown)
        assertTrue("应提示明天", info.eyebrow.contains("明天"))
        assertFalse(info.staticText.isBlank())
    }

    @Test
    fun nextInfo_empty_shows_placeholder() {
        val info = WidgetData.nextInfo(null, at(today, 12, 0))
        assertFalse(info.useCountdown)
        assertEquals("—", info.staticText)
        assertFalse(info.name.isBlank())
    }

    @Test
    fun minutesText_formats() {
        assertEquals("10:05", WidgetData.minutesText(10 * 60_000L + 5_000L))
        assertEquals("0:09", WidgetData.minutesText(9_000L))
    }

    /* ── 下次刷新时刻 ─────────────────────────────────────── */

    @Test
    fun nextRefreshAt_is_next_class_boundary() {
        val now = at(today, 7, 0)                        // 08:00 上课
        assertEquals(at(today, 8, 0), WidgetData.nextRefreshAt(sampleEvents(), now))
    }

    @Test
    fun nextRefreshAt_uses_class_end_while_ongoing() {
        val now = at(today, 8, 30)                       // 09:40 下课
        assertEquals(at(today, 9, 40), WidgetData.nextRefreshAt(sampleEvents(), now))
    }

    @Test
    fun nextRefreshAt_falls_back_to_midnight() {
        val now = at(today, 23, 30)
        val midnight = WidgetData.startOfDay(now) + 86_400_000L
        assertEquals(midnight, WidgetData.nextRefreshAt(emptyList(), now))
    }

    @Test
    fun startOfDay_is_local_midnight() {
        val ms = at(today, 15, 33)
        val sod = WidgetData.startOfDay(ms)
        assertEquals(
            today,
            Instant.ofEpochMilli(sod).atZone(zone).toLocalDate()
        )
        assertEquals(0, Instant.ofEpochMilli(sod).atZone(zone).hour)
    }
}
