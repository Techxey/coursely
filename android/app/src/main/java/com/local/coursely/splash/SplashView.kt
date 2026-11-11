package com.local.coursely.splash

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PathMeasure
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.text.TextPaint
import android.util.AttributeSet
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.animation.LinearInterpolator
import androidx.core.content.ContextCompat
import com.local.coursely.R

/**
 * 开屏动画（从个人主页的开屏 1:1 移植成原生）：
 *
 *   光晕扩散 → 圆卡弹出 → 圆环逐笔描绘（开口的 0）→ 一笔向右上（1）→ 圆点亮起
 *   → 双圈涟漪 → 标题上浮 → 进度条生长 → 点按或播完 → 模糊上移淡出
 *
 * 时间轴（毫秒）照抄站点 CSS，fast 模式用于「本次会话第二次及以后」的冷启动。
 */
class SplashView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    var onIntroDone: (() -> Unit)? = null
    var onExitDone: (() -> Unit)? = null

    /* ── 时间轴（站点值） ─────────────────────────────────── */
    private companion object {
        const val T_GLOW = 50L;      const val D_GLOW = 1500L
        const val T_CARD = 100L;     const val D_CARD = 780L
        const val T_ARC = 180L;      const val D_ARC = 850L
        const val T_LINE = 1000L;    const val D_LINE = 400L
        const val T_DOT = 1350L;     const val D_DOT = 400L
        const val T_RIP1 = 900L;     const val D_RIP = 1500L
        const val T_RIP2 = 1200L
        const val T_EYEBROW = 1400L; const val D_EYEBROW = 500L
        const val T_NAME = 1500L;    const val D_NAME = 550L
        const val T_SUB = 1620L;     const val D_SUB = 500L
        const val T_PROGRESS = 1500L; const val D_PROGRESS = 850L
        const val T_FOOTER = 1600L;  const val D_FOOTER = 450L
        const val TOTAL = 2400L
        const val D_EXIT = 620L
        const val D_EXIT_FAST = 280L

        // fast 模式（站点 .is-fast）
        const val F_CARD = 340L
        const val F_ARC = 300L
        const val F_LINE = 160L;  const val F_T_LINE = 280L
        const val F_DOT = 200L;   const val F_T_DOT = 420L
        const val F_NAME = 320L;  const val F_T_NAME = 40L
        const val F_TOTAL = 700L
    }

    /* ── 颜色 ─────────────────────────────────────────────── */
    private val cBg = ContextCompat.getColor(context, R.color.splash_bg)
    private val cCard = ContextCompat.getColor(context, R.color.splash_card)
    private val cText = ContextCompat.getColor(context, R.color.splash_text)
    private val cText2 = ContextCompat.getColor(context, R.color.splash_text2)
    private val cText3 = ContextCompat.getColor(context, R.color.splash_text3)
    private val cFill = ContextCompat.getColor(context, R.color.splash_fill)
    private val cHair = ContextCompat.getColor(context, R.color.splash_hairline)
    private val cBlue = ContextCompat.getColor(context, R.color.splash_blue)
    private val gStart = ContextCompat.getColor(context, R.color.splash_grad_start)
    private val gCenter = ContextCompat.getColor(context, R.color.splash_grad_center)
    private val gEnd = ContextCompat.getColor(context, R.color.splash_grad_end)

    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun sp(v: Float) =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, resources.displayMetrics)

    /* ── 几何（站点 viewBox 120 的原始坐标） ───────────────── */
    private val cardR = dp(52f)                 // 104px 圆卡
    private val markBox = dp(104f) * 0.74f      // logo 占 74%
    private val unit = markBox / 120f           // 1 个 SVG 单位 = 多少 px

    private val arcPath = Path()
    private val linePath = Path()
    private val dotCx = 110f
    private val dotCy = 8f
    private val dotR = 6f

    private val arcMeasure = PathMeasure()
    private var arcLen = 0f
    private val lineMeasure = PathMeasure()
    private var lineLen = 0f
    private val tmpPath = Path()

    /* ── 画笔 ─────────────────────────────────────────────── */
    private val paintCard = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cCard }
    private val paintHair = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(1f); color = cHair
    }
    private val paintGlow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val paintRipple = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.5f)
        color = cBlue
    }
    private val paintArc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 8.2f                       // 站点 stroke-width（单位坐标系）
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val paintLine = Paint(paintArc)
    private val paintDot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = gEnd }
    private val paintProgressTrack = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cFill }
    private val paintProgressBar = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cBlue }

    private val tpEyebrow = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cBlue; textSize = sp(11f); letterSpacing = 0.28f; isFakeBoldText = true
    }
    private val tpName = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cText; textSize = sp(30f); letterSpacing = -0.05f; isFakeBoldText = true
    }
    private val tpSub = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cText2; textSize = sp(14f)
    }
    private val tpFooter = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cText3; textSize = sp(11.5f)
    }
    private val tpSkip = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cText3; textSize = sp(10.5f); alpha = 158
    }

    /* ── 状态 ─────────────────────────────────────────────── */
    private var fast = false
    private var elapsed = 0L
    private var total = TOTAL
    private var introDone = false
    private var exiting = false
    private var exitT = 0f
    private var animator: ValueAnimator? = null
    private var exitAnimator: ValueAnimator? = null

    init {
        // 圆环：以 (50, 68.09) 为圆心、r=34，从 -45.1° 逆时针扫 270.2°
        val oval = RectF(16f, 34.09f, 84f, 102.09f)
        arcPath.addArc(oval, -45.1f, -270.2f)

        linePath.moveTo(74f, 44f)
        linePath.lineTo(110f, 8f)

        arcMeasure.setPath(arcPath, false)
        arcLen = arcMeasure.length
        lineMeasure.setPath(linePath, false)
        lineLen = lineMeasure.length

        // 站点里每条笔画各自的 objectBoundingBox 渐变
        paintArc.shader = LinearGradient(
            16f, 102.1f, 74f, 34.1f,
            intArrayOf(gStart, gCenter, gEnd), floatArrayOf(0f, 0.52f, 1f),
            Shader.TileMode.CLAMP
        )
        paintLine.shader = LinearGradient(
            74f, 44f, 110f, 8f,
            intArrayOf(gStart, gCenter, gEnd), floatArrayOf(0f, 0.52f, 1f),
            Shader.TileMode.CLAMP
        )
    }

    /** 开始播放；fast=true 用站点的「快闪版」 */
    fun start(fastMode: Boolean) {
        fast = fastMode
        total = if (fast) F_TOTAL else TOTAL
        elapsed = 0L
        introDone = false
        exiting = false
        exitT = 0f
        invalidate()
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = total
            interpolator = LinearInterpolator()
            addUpdateListener {
                elapsed = ((it.animatedValue as Float) * total).toLong()
                invalidate()
            }
            doOnEndCompat {
                if (!introDone && !exiting) {
                    introDone = true
                    onIntroDone?.invoke()
                }
            }
            start()
        }
    }

    private inline fun ValueAnimator.doOnEndCompat(crossinline block: () -> Unit) {
        addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) = block()
        })
    }

    /** 收场：模糊上移淡出（原生没有 blur，用位移+放大+淡出等价表达） */
    fun playExit() {
        if (exiting) return
        exiting = true
        animator?.cancel()
        exitAnimator?.cancel()
        exitAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (fast) D_EXIT_FAST else D_EXIT
            interpolator = LinearInterpolator()
            addUpdateListener {
                exitT = it.animatedValue as Float
                invalidate()
            }
            doOnEndCompat { onExitDone?.invoke() }
            start()
        }
    }

    /** 轻点任意处跳过 */
    private fun skip() {
        if (introDone || exiting) return
        animator?.cancel()
        elapsed = total
        introDone = true
        invalidate()
        onIntroDone?.invoke()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) skip()
        return true
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        exitAnimator?.cancel()
        super.onDetachedFromWindow()
    }

    /* ── 绘制 ─────────────────────────────────────────────── */

    private fun p(start: Long, dur: Long, t: Float): Float =
        ((t - start) / dur.toFloat()).coerceIn(0f, 1f)

    private fun easeOut(x: Float): Float {
        val i = 1f - x
        return 1f - i * i * i
    }

    private fun spring(x: Float): Float {
        val c1 = 1.70158f
        val c3 = c1 + 1f
        val p = x - 1f
        return 1f + c3 * p * p * p + c1 * p * p
    }

    private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

    @SuppressLint("DrawAllocation")
    override fun onDraw(canvas: Canvas) {
        val t = elapsed.toFloat()
        val out = exitT
        val keep = 1f - out
        val cx = width / 2f
        val cy = height * 0.445f

        // 背景（退场时一起淡出，露出下面的 WebView）
        canvas.drawColor(applyAlpha(cBg, keep))

        canvas.save()
        if (out > 0f) {
            canvas.translate(0f, -dp(20f) * out)
            canvas.scale(1f + 0.035f * out, 1f + 0.035f * out, cx, cy)
        }
        val a = keep

        if (!fast) drawGlow(canvas, cx, cy, t, a)
        if (!fast) drawRipples(canvas, cx, cy, t, a)
        drawCard(canvas, cx, cy, t, a)
        drawMark(canvas, cx, cy, t, a)
        drawTexts(canvas, cx, cy, t, a)
        if (!fast) drawBottom(canvas, t, a)
        else drawFooterOnly(canvas, a)

        canvas.restore()
    }

    private fun applyAlpha(color: Int, keep: Float): Int =
        (color and 0x00FFFFFF) or (((color ushr 24) * keep).toInt() shl 24)

    private fun drawGlow(canvas: Canvas, cx: Float, cy: Float, t: Float, a: Float) {
        val p = p(T_GLOW, D_GLOW, t)
        if (p <= 0f) return
        // 0 → .85（45%）→ .42
        val alpha = if (p < 0.45f) lerp(0f, 0.85f, p / 0.45f) else lerp(0.85f, 0.42f, (p - 0.45f) / 0.55f)
        val scale = lerp(0.35f, 1.15f, easeOut(p))
        val radius = dp(380f) * scale
        val g = RadialGradient(
            cx, cy - dp(20f), radius,
            intArrayOf(
                withAlpha(cBlue, (0.24f * alpha * a)),
                withAlpha(cBlue, 0f)
            ),
            floatArrayOf(0f, 0.62f),
            Shader.TileMode.CLAMP
        )
        paintGlow.shader = g
        canvas.drawCircle(cx, cy - dp(20f), radius, paintGlow)
    }

    private fun drawRipples(canvas: Canvas, cx: Float, cy: Float, t: Float, a: Float) {
        listOf(T_RIP1, T_RIP2).forEach { start ->
            val p = p(start, D_RIP, t)
            if (p <= 0f || p >= 1f) return@forEach
            val scale = lerp(0.85f, 2.1f, easeOut(p))
            val alpha = lerp(0.55f, 0f, p) * a
            paintRipple.color = withAlpha(cBlue, alpha)
            canvas.drawCircle(cx, cy, cardR * scale, paintRipple)
        }
    }

    private fun drawCard(canvas: Canvas, cx: Float, cy: Float, t: Float, a: Float) {
        val pCard = if (fast) p(0, F_CARD, t) else p(T_CARD, D_CARD, t)
        if (pCard <= 0f) return
        val s = if (fast) easeOut(pCard) else spring(pCard)
        val alpha = a * if (pCard < 0.4f) pCard / 0.4f else 1f

        canvas.save()
        canvas.scale(s, s, cx, cy)

        // 卡下方的柔和投影（站点 box-shadow 的蓝色光）
        val shadow = RadialGradient(
            cx, cy + dp(14f), cardR * 1.5f,
            intArrayOf(withAlpha(cBlue, 0.18f * alpha), withAlpha(cBlue, 0f)),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        paintGlow.shader = shadow
        canvas.drawCircle(cx, cy + dp(14f), cardR * 1.5f, paintGlow)

        paintCard.color = withAlpha(cCard, alpha)
        canvas.drawCircle(cx, cy, cardR, paintCard)
        paintHair.color = withAlpha(cHair, alpha)
        canvas.drawCircle(cx, cy, cardR, paintHair)
        canvas.restore()
    }

    private fun drawMark(canvas: Canvas, cx: Float, cy: Float, t: Float, a: Float) {
        val pCard = if (fast) p(0, F_CARD, t) else p(T_CARD, D_CARD, t)
        if (pCard <= 0f) return
        val s = if (fast) easeOut(pCard) else spring(pCard)
        val fade = if (pCard < 0.4f) pCard / 0.4f else 1f
        val alpha = (255f * a * fade).toInt().coerceIn(0, 255)

        canvas.save()
        canvas.scale(s, s, cx, cy)
        canvas.translate(cx, cy)
        canvas.scale(unit, unit)
        canvas.translate(-60f, -60f)

        val arcP = easeOut(if (fast) p(0, F_ARC, t) else p(T_ARC, D_ARC, t))
        val lineP = easeOut(if (fast) p(F_T_LINE, F_LINE, t) else p(T_LINE, D_LINE, t))
        val dotP = if (fast) p(F_T_DOT, F_DOT, t) else p(T_DOT, D_DOT, t)

        paintArc.alpha = alpha
        paintLine.alpha = alpha

        if (arcP > 0f) {
            tmpPath.reset()
            arcMeasure.getSegment(0f, arcLen * arcP, tmpPath, true)
            canvas.drawPath(tmpPath, paintArc)
        }
        if (lineP > 0f) {
            tmpPath.reset()
            lineMeasure.getSegment(0f, lineLen * lineP, tmpPath, true)
            canvas.drawPath(tmpPath, paintLine)
        }
        if (dotP > 0f) {
            paintDot.color = withAlpha(gEnd, alpha / 255f)
            canvas.drawCircle(dotCx, dotCy, dotR * spring(dotP), paintDot)
        }

        canvas.restore()
    }

    private fun drawTexts(canvas: Canvas, cx: Float, cy: Float, t: Float, a: Float) {
        var top = cy + cardR + dp(26f)          // 站点 logo-wrap 的下外边距 26px

        if (!fast) {
            val pe = p(T_EYEBROW, D_EYEBROW, t)
            drawFadeUp(canvas, "COURSELY", tpEyebrow, cx, top, pe, a)
            top += tpEyebrow.textSize + dp(12f)
        }

        val pn = if (fast) p(F_T_NAME, F_NAME, t) else p(T_NAME, D_NAME, t)
        drawFadeUp(canvas, "课序", tpName, cx, top, pn, a)
        top += tpName.textSize * 1.2f + dp(12f)

        if (!fast) {
            val ps = p(T_SUB, D_SUB, t)
            drawFadeUp(canvas, "不只是课表", tpSub, cx, top, ps, a)
        }
    }

    /** topY 是这一行文字的「块顶」，内部换算成基线，再叠加 14dp 的上浮 */
    private fun drawFadeUp(
        canvas: Canvas, text: String, paint: TextPaint,
        cx: Float, topY: Float, prog: Float, a: Float
    ) {
        if (prog <= 0f) return
        val e = easeOut(prog)
        val dy = (1f - e) * dp(14f)
        paint.alpha = (255 * a * e).toInt().coerceIn(0, 255)
        paint.textAlign = Paint.Align.CENTER
        val baseline = topY - paint.fontMetrics.top + dy
        canvas.drawText(text, cx, baseline, paint)
    }

    private fun drawBottom(canvas: Canvas, t: Float, a: Float) {
        val barW = minOf(dp(220f), width * 0.6f)
        val left = (width - barW) / 2f
        val trackTop = height - dp(96f)
        val h = dp(3f)

        paintProgressTrack.color = withAlpha(cFill, a)
        val rect = RectF(left, trackTop, left + barW, trackTop + h)
        canvas.drawRoundRect(rect, h / 2f, h / 2f, paintProgressTrack)

        val pp = easeOut(p(T_PROGRESS, D_PROGRESS, t))
        if (pp > 0f) {
            canvas.save()
            canvas.clipRect(left, trackTop, left + barW * pp, trackTop + h)
            paintProgressBar.color = withAlpha(cBlue, a)
            canvas.drawRoundRect(rect, h / 2f, h / 2f, paintProgressBar)
            canvas.restore()
        }

        val pf = p(T_FOOTER, D_FOOTER, t)
        if (pf > 0f) {
            tpFooter.alpha = (255 * a * easeOut(pf)).toInt().coerceIn(0, 255)
            tpFooter.textAlign = Paint.Align.CENTER
            canvas.drawText("从 0 开始，一笔一笔排好这一学期", width / 2f, height - dp(72f), tpFooter)
        }

        tpSkip.alpha = (158 * a).toInt()
        tpSkip.textAlign = Paint.Align.CENTER
        canvas.drawText("轻点任意处跳过", width / 2f, height - dp(46f), tpSkip)

        // 底部指示条
        paintProgressTrack.color = withAlpha(cText, 0.2f * a)
        val hw = dp(120f)
        canvas.drawRoundRect(
            RectF(width / 2f - hw / 2f, height - dp(14f), width / 2f + hw / 2f, height - dp(9f)),
            dp(3f), dp(3f), paintProgressTrack
        )
    }

    private fun drawFooterOnly(canvas: Canvas, a: Float) {
        paintProgressTrack.color = withAlpha(cText, 0.2f * a)
        val hw = dp(120f)
        canvas.drawRoundRect(
            RectF(width / 2f - hw / 2f, height - dp(14f), width / 2f + hw / 2f, height - dp(9f)),
            dp(3f), dp(3f), paintProgressTrack
        )
    }

    private fun withAlpha(color: Int, a: Float): Int {
        val alpha = ((color ushr 24) * a.coerceIn(0f, 1f)).toInt().coerceIn(0, 255)
        return (color and 0x00FFFFFF) or (alpha shl 24)
    }

    /* ── 测试用：直接定帧 ─────────────────────────────────── */
    fun setFrameForTest(ms: Long, fastMode: Boolean) {
        fast = fastMode
        total = if (fast) F_TOTAL else TOTAL
        elapsed = ms
        invalidate()
    }
}
