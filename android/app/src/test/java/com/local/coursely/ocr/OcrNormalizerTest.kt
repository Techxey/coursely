package com.local.coursely.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * OCR 坐标归一化 / 文本清洗 纯逻辑单测（不需要 Robolectric）。
 * 期望值来自契约：「x/y/w/h 全部是图片归一化比例 0–1，size 是文字高度（像素）」。
 */
class OcrNormalizerTest {

    @Test
    fun normalizeRectMapsPixelBoxToUnitSquare() {
        val line = OcrNormalizer.normalizeRect("高等数学（上）", 120, 310, 340, 360, 1000, 2000)!!
        assertEquals("高等数学（上）", line.text)
        assertEquals(0.12, line.x, 1e-9)
        assertEquals(0.155, line.y, 1e-9)
        assertEquals(0.22, line.w, 1e-9)
        assertEquals(0.025, line.h, 1e-9)
        assertEquals(50, line.size)
    }

    @Test
    fun normalizeRectClampsOutOfBoundsBoxes() {
        val line = OcrNormalizer.normalizeRect("教三-201", -50, -20, 120, 40, 100, 100)!!
        assertEquals(0.0, line.x, 1e-9)
        assertEquals(0.0, line.y, 1e-9)
        assertEquals(1.0, line.w, 1e-9) // 170/100 越界 → 夹到 1
        assertEquals(0.6, line.h, 1e-9)
    }

    @Test
    fun normalizeRectDropsBlankAndSymbolOnlyBoxes() {
        assertNull(OcrNormalizer.normalizeRect("", 0, 0, 10, 10, 100, 100))
        assertNull(OcrNormalizer.normalizeRect("   ", 0, 0, 10, 10, 100, 100))
        assertNull(OcrNormalizer.normalizeRect("——", 0, 0, 10, 10, 100, 100))
        assertNull(OcrNormalizer.normalizeRect("·", 0, 0, 10, 10, 100, 100))
    }

    @Test
    fun normalizeRectRejectsInvalidGeometry() {
        assertNull(OcrNormalizer.normalizeRect("高数", 0, 0, 0, 10, 100, 100))
        assertNull(OcrNormalizer.normalizeRect("高数", 0, 0, 10, 10, 0, 100))
        assertNull(OcrNormalizer.normalizeRect("高数", 0, 0, 10, 10, 100, 0))
    }

    @Test
    fun cleanTextCollapsesWhitespaceButKeepsLatinWords() {
        assertEquals("高等数学（上）", OcrNormalizer.cleanText("  高等数学（上） "))
        assertEquals("高等数学（上）", OcrNormalizer.cleanText("高等 数学（上）"))
        assertEquals("Data Structures", OcrNormalizer.cleanText(" Data   Structures "))
        assertEquals("高等数学 Data", OcrNormalizer.cleanText("高等 数学  Data"))
    }

    @Test
    fun isMeaningfulRequiresLetterOrDigit() {
        assertTrue(OcrNormalizer.isMeaningful("数据结构"))
        assertTrue(OcrNormalizer.isMeaningful("CS101"))
        assertFalse(OcrNormalizer.isMeaningful("——"))
        assertFalse(OcrNormalizer.isMeaningful(" · "))
        assertFalse(OcrNormalizer.isMeaningful(""))
    }

    @Test
    fun round4KeepsFourDecimals() {
        assertEquals(0.1235, OcrNormalizer.round4(0.1234567), 0.0)
        assertEquals(0.0, OcrNormalizer.round4(0.0), 0.0)
        assertEquals(1.0, OcrNormalizer.round4(0.999999), 0.0)
    }
}
