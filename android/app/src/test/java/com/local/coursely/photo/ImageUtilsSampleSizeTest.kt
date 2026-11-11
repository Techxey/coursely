package com.local.coursely.photo

import org.junit.Assert.assertEquals
import org.junit.Test

/** 采样率计算纯逻辑单测：契约要求最长边 <= 1600，采样后再精确缩放。 */
class ImageUtilsSampleSizeTest {

    @Test
    fun largeImageIsSubsampled() {
        assertEquals(2, ImageUtils.calculateInSampleSize(4000, 3000, ImageUtils.MAX_SIDE))
    }

    @Test
    fun veryLargeImageUsesPowerOfTwo() {
        assertEquals(4, ImageUtils.calculateInSampleSize(8000, 6000, ImageUtils.MAX_SIDE))
    }

    @Test
    fun alreadySmallImageIsNotSubsampled() {
        assertEquals(1, ImageUtils.calculateInSampleSize(800, 600, ImageUtils.MAX_SIDE))
    }

    @Test
    fun exactMaxSideIsNotSubsampled() {
        assertEquals(1, ImageUtils.calculateInSampleSize(1600, 1200, ImageUtils.MAX_SIDE))
    }

    @Test
    fun invalidInputFallsBackToOne() {
        assertEquals(1, ImageUtils.calculateInSampleSize(0, 0, 1600))
        assertEquals(1, ImageUtils.calculateInSampleSize(100, 100, 0))
    }
}
