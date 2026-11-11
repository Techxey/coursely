package com.local.coursely.splash

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import com.local.coursely.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * 把开屏动画按时间轴逐帧渲染成 PNG —— 没有真机也能肉眼校验动画的版面与配色。
 * 产物：app/build/splash-frames/frame-*.png
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w411dp-h891dp-xhdpi")
class SplashFrameRenderTest {

    @Test
    fun renderFullSplashFrames() {
        val ctx = RuntimeEnvironment.getApplication()
        ctx.setTheme(R.style.AppTheme)

        val w = 1080
        val h = 2340
        val view = SplashView(ctx)
        view.measure(
            View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
        )
        view.layout(0, 0, w, h)

        val outDir = File("build/splash-frames").apply { mkdirs() }
        listOf(150L, 500L, 800L, 1100L, 1450L, 1800L, 2300L).forEach { ms ->
            view.setFrameForTest(ms, false)
            writeFrame(view, w, h, File(outDir, "full-$ms.png"))
        }
        println("SPLASH_FRAMES_DIR=" + outDir.absolutePath)
    }

    @Test
    fun renderFastSplashFrames() {
        val ctx = RuntimeEnvironment.getApplication()
        ctx.setTheme(R.style.AppTheme)

        val w = 1080
        val h = 2340
        val view = SplashView(ctx)
        view.measure(
            View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
        )
        view.layout(0, 0, w, h)

        val outDir = File("build/splash-frames").apply { mkdirs() }
        listOf(120L, 340L, 520L, 640L, 700L).forEach { ms ->
            view.setFrameForTest(ms, true)
            writeFrame(view, w, h, File(outDir, "fast-$ms.png"))
        }
    }

    private fun writeFrame(view: View, w: Int, h: Int, file: File) {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        view.draw(canvas)
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
    }
}
