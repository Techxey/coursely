package com.local.coursely.reminder

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 提醒 JSON 协议单测（org.json 需要 Robolectric 提供实现）。
 * 载荷格式见 BRIDGE-CONTRACT.md 第 3 节 syncReminders。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ReminderJsonTest {

    @Test
    fun parseItemsSkipsInvalidEntries() {
        val array = JSONArray()
        array.put(
            JSONObject()
                .put("id", "c|c1|2026-11-09")
                .put("atMs", 1762600000000L)
                .put("title", "还有 10 分钟上课")
                .put("body", "数据结构 · 教三-201 · 2 节")
        )
        array.put(JSONObject().put("id", "").put("atMs", 1L))
        array.put(JSONObject().put("id", "no-time"))
        array.put(JSONObject().put("atMs", 123L))

        val items = ReminderLogic.parseItems(array)
        assertEquals(1, items.size)
        assertEquals("c|c1|2026-11-09", items[0].id)
        assertEquals(1762600000000L, items[0].atMs)
        assertEquals("数据结构 · 教三-201 · 2 节", items[0].body)
    }

    @Test
    fun parseItemsUsesDefaultTitleWhenMissing() {
        val array = JSONArray()
        array.put(JSONObject().put("id", "t|t1").put("atMs", 2000L).put("body", "作业"))
        val items = ReminderLogic.parseItems(array)
        assertEquals(ReminderLogic.DEFAULT_TITLE, items[0].title)
    }

    @Test
    fun jsonRoundTripsCodesAndItems() {
        val items = listOf(
            ReminderItem("c|c1|2026-11-09", 1762600000000L, "还有 10 分钟上课", "数据结构"),
            ReminderItem("t|t1", 1762700000000L, "作业快截止了", "第三章习题")
        )
        val codes = mapOf("c|c1|2026-11-09" to 42, "t|t1" to -7)
        val (loadedCodes, loadedItems) = ReminderStore.fromJson(ReminderStore.toJson(codes, items))
        assertEquals(codes, loadedCodes)
        assertEquals(items, loadedItems)
    }

    @Test
    fun garbageStateIsTreatedAsEmpty() {
        val (codes, items) = ReminderStore.fromJson("{not json")
        assertTrue(codes.isEmpty())
        assertTrue(items.isEmpty())
    }

    @Test
    fun syncResultJsonIsWellFormed() {
        val json = JSONObject(SyncResult(12, true).toJson())
        assertEquals(12, json.getInt("scheduled"))
        assertTrue(json.getBoolean("exact"))
    }
}
