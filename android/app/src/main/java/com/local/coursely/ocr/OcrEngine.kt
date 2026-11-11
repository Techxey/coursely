package com.local.coursely.ocr

import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import android.graphics.Bitmap
import com.local.coursely.photo.ImageUtils
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 一行 OCR 结果。x/y/w/h 是**图片归一化比例（0–1，原点左上）**；
 * size 是这一行文字框的像素高度，用来区分标题字与教室小字。
 */
data class OcrLine(
    val text: String,
    val x: Double,
    val y: Double,
    val w: Double,
    val h: Double,
    val size: Int
)

/** OCR 结果：成功带整图尺寸与行列表，失败带契约里的错误码。 */
sealed class OcrOutcome {
    data class Success(val width: Int, val height: Int, val lines: List<OcrLine>) : OcrOutcome()
    data class Failure(val code: String) : OcrOutcome()
}

/**
 * 纯逻辑：文本清洗 + 坐标归一化。不碰 Android API，单测直接覆盖。
 */
object OcrNormalizer {

    private val WHITESPACE = Regex("\\s+")

    /** CJK / 全角标点之间的空格去掉（中文 OCR 常插空格，会破坏课程名匹配）。 */
    private val CJK_INNER_SPACE = Regex(
        "(?<=[\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef])\\s+(?=[\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef])"
    )

    /** 文本清洗：去首尾空白、内部空白压成一个空格、再去掉纯中文之间的空格。 */
    fun cleanText(raw: String): String {
        val collapsed = raw.trim().replace(WHITESPACE, " ")
        return collapsed.replace(CJK_INNER_SPACE, "")
    }

    /** 至少有一个字母 / 数字 / 汉字才算有效行；纯符号（如 `——`、`·`）丢掉。 */
    fun isMeaningful(text: String): Boolean = text.any { it.isLetterOrDigit() }

    fun clamp01(value: Double): Double = when {
        value.isNaN() -> 0.0
        value < 0.0 -> 0.0
        value > 1.0 -> 1.0
        else -> value
    }

    /** 保留 4 位小数，避免 JSON 里出现一长串浮点噪声。 */
    fun round4(value: Double): Double = Math.round(value * 10000.0) / 10000.0

    /**
     * 把 ML Kit 的像素 boundingBox 转成归一化行结构。
     * 图片尺寸非法 / 框为空 / 文本无意义时返回 null（调用方直接跳过）。
     */
    fun normalizeRect(
        rawText: String,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
        imageWidth: Int,
        imageHeight: Int
    ): OcrLine? {
        if (imageWidth <= 0 || imageHeight <= 0) return null
        val width = right - left
        val height = bottom - top
        if (width <= 0 || height <= 0) return null
        val text = cleanText(rawText)
        if (text.isEmpty() || !isMeaningful(text)) return null
        val iw = imageWidth.toDouble()
        val ih = imageHeight.toDouble()
        return OcrLine(
            text = text,
            x = clamp01(left / iw),
            y = clamp01(top / ih),
            w = clamp01(width / iw),
            h = clamp01(height / ih),
            size = height
        )
    }

    /** 把 ML Kit 识别结果拍平成行列表（纯结构转换，不含坐标计算）。 */
    fun collectLines(text: Text, imageWidth: Int, imageHeight: Int): List<OcrLine> {
        if (imageWidth <= 0 || imageHeight <= 0) return emptyList()
        val out = ArrayList<OcrLine>()
        for (block in text.textBlocks) {
            for (line in block.lines) {
                val box = line.boundingBox ?: continue
                val normalized = normalizeRect(
                    line.text,
                    box.left,
                    box.top,
                    box.right,
                    box.bottom,
                    imageWidth,
                    imageHeight
                )
                if (normalized != null) out.add(normalized)
            }
        }
        return out
    }
}

/**
 * 离线中文 OCR（ML Kit bundled，模型在 APK 里，不需要网络 / 不需要 Google Play 服务）。
 *
 * - 识别在后台线程发起；`callback` 可能在任意线程回调（NativeBridge 的 resolve 是线程安全的）。
 * - 20s 超时回 `ocr_failed`；成功 / 失败 / 超时只会回调一次。
 * - 使用完由 NativeBridge.dispose() 调 [dispose]。
 */
class OcrEngine {

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "coursely-ocr").apply { isDaemon = true }
    }

    private val timeoutExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "coursely-ocr-timeout").apply { isDaemon = true }
        }

    private val closed = AtomicBoolean(false)

    @Volatile
    private var recognizer: TextRecognizer? = null

    private fun recognizerOrCreate(): TextRecognizer? {
        if (closed.get()) return null
        recognizer?.let { return it }
        return synchronized(this) {
            if (closed.get()) {
                null
            } else {
                recognizer ?: TextRecognition
                    .getClient(ChineseTextRecognizerOptions.Builder().build())
                    .also { recognizer = it }
            }
        }
    }

    /**
     * 识别一张 dataUrl 图片。
     * @param timeoutMs 总超时（含排队 + 解码 + 识别）
     */
    fun recognize(dataUrl: String?, timeoutMs: Long = DEFAULT_TIMEOUT_MS, callback: (OcrOutcome) -> Unit) {
        val done = AtomicBoolean(false)
        val timer: ScheduledFuture<*> = try {
            timeoutExecutor.schedule({
                if (done.compareAndSet(false, true)) callback(OcrOutcome.Failure("ocr_failed"))
            }, timeoutMs, TimeUnit.MILLISECONDS)
        } catch (t: Throwable) {
            callback(OcrOutcome.Failure("ocr_failed"))
            return
        }

        fun finish(outcome: OcrOutcome) {
            if (done.compareAndSet(false, true)) {
                timer.cancel(false)
                callback(outcome)
            }
        }

        if (closed.get()) {
            finish(OcrOutcome.Failure("ocr_failed"))
            return
        }

        val rec = recognizerOrCreate()
        if (rec == null) {
            finish(OcrOutcome.Failure("ocr_failed"))
            return
        }

        try {
            executor.execute {
                try {
                    val bitmap = ImageUtils.decodeDataUrl(dataUrl)
                    if (bitmap == null) {
                        finish(OcrOutcome.Failure("decode_failed"))
                        return@execute
                    }
                    val width = bitmap.width
                    val height = bitmap.height
                    rec.process(InputImage.fromBitmap(bitmap, 0))
                        .addOnSuccessListener { text ->
                            finish(OcrOutcome.Success(width, height, OcrNormalizer.collectLines(text, width, height)))
                        }
                        .addOnFailureListener {
                            finish(OcrOutcome.Failure("ocr_failed"))
                        }
                } catch (t: Throwable) {
                    finish(OcrOutcome.Failure("ocr_failed"))
                }
            }
        } catch (t: Throwable) {
            // executor 已关闭等
            finish(OcrOutcome.Failure("ocr_failed"))
        }
    }

    /** 释放 ML Kit recognizer 与线程。可重复调用。 */
    fun dispose() {
        if (!closed.compareAndSet(false, true)) return
        val rec = recognizer
        recognizer = null
        try {
            rec?.close()
        } catch (t: Throwable) {
            // ignore
        }
        try {
            executor.shutdown()
        } catch (t: Throwable) {
            // ignore
        }
        try {
            timeoutExecutor.shutdownNow()
        } catch (t: Throwable) {
            // ignore
        }
    }

    companion object {
        /** 契约要求 20s 超时 */
        const val DEFAULT_TIMEOUT_MS = 20_000L
    }
}
