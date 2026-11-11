package com.local.coursely.photo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

/**
 * 图片读取 / 缩放 / EXIF 摆正 / JPEG 编码。
 *
 * 这些方法都是阻塞 IO + CPU 操作，**必须**在后台线程调用（NativeBridge 的 io 线程）。
 * 输出约定见 BRIDGE-CONTRACT.md：最长边 <= 1600、JPEG 质量 85、NO_WRAP Base64。
 */
object ImageUtils {

    const val MAX_SIDE = 1600
    const val JPEG_QUALITY = 85
    const val DATA_URL_PREFIX = "data:image/jpeg;base64,"

    /** 打开 uri 的输入流；file:// 也支持（相机结果走这条）。失败返回 null。 */
    fun openStream(context: Context, uri: Uri): InputStream? = try {
        if ("file".equals(uri.scheme, true)) {
            val path = uri.path
            if (path.isNullOrEmpty()) null else FileInputStream(File(path))
        } else {
            context.contentResolver.openInputStream(uri)
        }
    } catch (t: Throwable) {
        null
    }

    /**
     * 两段式解码：先只读尺寸算出 inSampleSize，再真正解码，按 EXIF 摆正，
     * 最后精确缩放到最长边 <= maxSide。任何一步失败返回 null。
     */
    fun loadScaled(context: Context, uri: Uri, maxSide: Int = MAX_SIDE): Bitmap? {
        if (maxSide <= 0) return null
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            openStream(context, uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

            val opts = BitmapFactory.Options().apply {
                inSampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, maxSide)
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            var bitmap = openStream(context, uri)?.use {
                BitmapFactory.decodeStream(it, null, opts)
            } ?: return null

            bitmap = applyExifOrientation(bitmap, readOrientation(context, uri))

            val longest = maxOf(bitmap.width, bitmap.height)
            if (longest > maxSide) {
                val scale = maxSide.toFloat() / longest
                val w = maxOf(1, Math.round(bitmap.width * scale))
                val h = maxOf(1, Math.round(bitmap.height * scale))
                val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
                if (scaled !== bitmap) bitmap = scaled
            }
            bitmap
        } catch (t: Throwable) {
            null
        }
    }

    /** 采样率计算（纯函数，单测覆盖）：保证采样后最长边仍 >= maxSide，避免解码过小。 */
    fun calculateInSampleSize(outWidth: Int, outHeight: Int, maxSide: Int): Int {
        if (outWidth <= 0 || outHeight <= 0 || maxSide <= 0) return 1
        var sample = 1
        while (maxOf(outWidth, outHeight) / (sample * 2) >= maxSide) {
            sample *= 2
        }
        return sample
    }

    /** 读 EXIF 方向；读不到返回 0（ORIENTATION_UNDEFINED）。 */
    private fun readOrientation(context: Context, uri: Uri): Int = try {
        if ("file".equals(uri.scheme, true)) {
            val path = uri.path
            if (path.isNullOrEmpty()) {
                0
            } else {
                ExifInterface(path).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL
                )
            }
        } else {
            openStream(context, uri)?.use {
                // API 24+ 支持 InputStream 构造；androidx.exifinterface 不在依赖里，用平台实现。
                ExifInterface(it).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL
                )
            } ?: 0
        }
    } catch (t: Throwable) {
        0
    }

    /** 按 EXIF 方向旋转 / 翻转。已经正立时原样返回。 */
    fun applyExifOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.setRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.setRotate(-90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
            else -> return bitmap
        }
        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (t: Throwable) {
            bitmap
        }
    }

    fun toJpegBytes(bitmap: Bitmap, quality: Int = JPEG_QUALITY): ByteArray {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), out)
        return out.toByteArray()
    }

    /** bitmap → `data:image/jpeg;base64,...` */
    fun toDataUrl(bitmap: Bitmap, quality: Int = JPEG_QUALITY): String =
        DATA_URL_PREFIX + Base64.encodeToString(toJpegBytes(bitmap, quality), Base64.NO_WRAP)

    /** `data:image/...;base64,...` → Bitmap。格式不对返回 null。 */
    fun decodeDataUrl(dataUrl: String?): Bitmap? {
        if (dataUrl.isNullOrEmpty()) return null
        val comma = dataUrl.indexOf(',')
        if (!dataUrl.startsWith("data:") || comma <= 0 || comma >= dataUrl.length - 1) return null
        return try {
            val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
            if (bytes.isEmpty()) null else BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (t: Throwable) {
            null
        }
    }
}
