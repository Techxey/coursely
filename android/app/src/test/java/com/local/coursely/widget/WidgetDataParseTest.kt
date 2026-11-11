package com.local.coursely.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * JSON 解析测试。
 * 必须跑在 Robolectric 下：纯 JVM 单测里的 org.json 是 android.jar 的空桩，
 * 解析会静默返回空列表（这正是这批用例要守住的地方）。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class WidgetDataParseTest {

    @Test
    fun parse_reads_events_and_skips_invalid() {
        val json = """
            {"events":[
              {"name":"数据结构与算法","room":"教三-201","startMs":100000,"endMs":200000,"tone":2},
              {"name":"","room":"x","startMs":1,"endMs":2},
              {"name":"坏数据","room":"x","startMs":0,"endMs":0},
              {"name":"倒挂","room":"x","startMs":300,"endMs":200}
            ]}
        """.trimIndent()
        val list = WidgetData.parse(json)
        assertEquals(1, list.size)
        assertEquals("数据结构与算法", list[0].name)
        assertEquals("教三-201", list[0].room)
        assertEquals(2, list[0].tone)
    }

    @Test
    fun parse_handles_null_and_garbage() {
        assertTrue(WidgetData.parse(null).isEmpty())
        assertTrue(WidgetData.parse("").isEmpty())
        assertTrue(WidgetData.parse("{not json").isEmpty())
        assertTrue(WidgetData.parse("{}").isEmpty())
    }

    @Test
    fun parse_clamps_tone_and_keeps_order() {
        val json = """
            {"events":[
              {"name":"高数","room":"教四-201","startMs":10,"endMs":20,"tone":99},
              {"name":"物理","room":"","startMs":30,"endMs":40,"tone":0}
            ]}
        """.trimIndent()
        val list = WidgetData.parse(json)
        assertEquals(2, list.size)
        assertEquals(8, list[0].tone)   // 99 → 8
        assertEquals(1, list[1].tone)   // 0  → 1
    }

    @Test
    fun parse_roundtrip_with_real_payload_shape() {
        // 与 js/android.js buildWidgetEvents() 推过来的结构一致
        val day = WidgetData.startOfDay(System.currentTimeMillis())
        val s = day + 8 * 3600_000L
        val json = """{"events":[{"name":"数据结构与算法","room":"教三-201","startMs":$s,"endMs":${s + 5400000},"tone":2}],"generatedAt":${System.currentTimeMillis()}}"""
        val list = WidgetData.parse(json)
        assertEquals(1, list.size)
        assertEquals(8, WidgetData.fmtTime(list[0].startMs).substringBefore(':').toInt())
    }
}
