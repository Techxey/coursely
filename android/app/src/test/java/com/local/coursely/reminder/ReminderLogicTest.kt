package com.local.coursely.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 提醒纯逻辑单测（不需要 Robolectric）：
 * requestCode 稳定 / 去重 / 撞哈希处理、按 id 去重、过滤过去时间与排序。
 */
class ReminderLogicTest {

    @Test
    fun requestCodesAreStableAndUnique() {
        val ids = listOf("c|c1|2026-11-09", "c|c2|2026-11-09", "t|t1", "Aa", "BB")
        val codes = ReminderLogic.assignRequestCodes(ids)
        assertEquals(ids.toSet(), codes.keys)
        assertEquals(5, codes.values.toSet().size)
        assertEquals(codes, ReminderLogic.assignRequestCodes(ids))
    }

    @Test
    fun hashCollisionsAreResolvedDeterministically() {
        // Java 里 "Aa" 与 "BB" 的 hashCode 相同，是天然的撞车样本
        assertEquals("Aa".hashCode(), "BB".hashCode())
        val codes = ReminderLogic.assignRequestCodes(listOf("Aa", "BB"))
        assertNotEquals(codes["Aa"], codes["BB"])
        assertEquals(codes, ReminderLogic.assignRequestCodes(listOf("Aa", "BB")))
    }

    @Test
    fun duplicateIdsCollapseInRequestCodeMap() {
        val codes = ReminderLogic.assignRequestCodes(listOf("same", "same", "same"))
        assertEquals(1, codes.size)
    }

    @Test
    fun dedupeKeepsLastValueAndFirstOrder() {
        val old = ReminderItem("x", 100, "old", "")
        val other = ReminderItem("y", 50, "y", "")
        val new = ReminderItem("x", 200, "new", "")
        val out = ReminderLogic.dedupeById(listOf(old, other, new))
        assertEquals(listOf("x", "y"), out.map { it.id })
        assertEquals("new", out[0].title)
    }

    @Test
    fun futureItemsFiltersPastAndSortsByTime() {
        val items = listOf(
            ReminderItem("past", 999, "a", ""),
            ReminderItem("later", 5000, "b", ""),
            ReminderItem("soon", 2000, "c", "")
        )
        val out = ReminderLogic.futureItems(items, 1000)
        assertEquals(listOf("soon", "later"), out.map { it.id })
    }

    @Test
    fun futureItemsDedupesBeforeSorting() {
        val items = listOf(
            ReminderItem("same", 3000, "a", ""),
            ReminderItem("same", 2000, "b", "")
        )
        val out = ReminderLogic.futureItems(items, 1000)
        assertEquals(1, out.size)
        // 保留最后一次出现的值
        assertEquals(2000L, out[0].atMs)
    }

    @Test
    fun futureItemsCapsAtMaxItems() {
        val items = (0 until ReminderLogic.MAX_ITEMS + 50).map {
            ReminderItem("id$it", 2000L + it, "t", "")
        }
        assertEquals(ReminderLogic.MAX_ITEMS, ReminderLogic.futureItems(items, 1000).size)
    }

    @Test
    fun emptyInputsAreSafe() {
        assertTrue(ReminderLogic.assignRequestCodes(emptyList()).isEmpty())
        assertTrue(ReminderLogic.dedupeById(emptyList()).isEmpty())
        assertTrue(ReminderLogic.futureItems(emptyList(), 1000).isEmpty())
    }
}
