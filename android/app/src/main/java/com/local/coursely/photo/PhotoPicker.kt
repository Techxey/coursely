package com.local.coursely.photo

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException

/**
 * 拍照 / 选图。
 *
 * 相机**不申请 CAMERA 权限**：把临时文件 URI 交给系统相机 App 代拍，
 * 由 FileProvider（authority `<applicationId>.fileprovider`，路径 cache/camera/）授权写。
 * 相册在 API 33+ 用系统 Photo Picker（ACTION_PICK_IMAGES），更低版本降级 ACTION_GET_CONTENT。
 *
 * 生命周期：cameraIntent() → 启动相机 → onActivityResult 里调 cameraResultUri(resultCode)。
 * 同一时刻只保留一个 pendingCameraFile；NativeBridge 负责「后到的请求顶掉前一个」。
 */
class PhotoPicker(private val context: Context) {

    private var pendingCameraFile: File? = null

    /**
     * 建 cache/camera 临时文件并返回拍照 Intent。
     * 系统没有相机 App 时调用方 startActivityForResult 会抛 ActivityNotFoundException。
     *
     * @throws IOException 缓存目录不可写 / FileProvider 配置异常
     */
    fun cameraIntent(): Intent {
        val dir = File(context.cacheDir, DIR_CAMERA)
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("camera cache dir unavailable")
        pruneOldFiles(dir)
        val file = File(dir, "pick_" + System.currentTimeMillis() + ".jpg")
        val uri = FileProvider.getUriForFile(context, context.packageName + AUTHORITY_SUFFIX, file)
        pendingCameraFile = file
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // 部分 ROM 只认 clipData 里的授权
            clipData = ClipData.newRawUri("coursely-photo", uri)
        }
    }

    /** 相册 Intent（API 33+ Photo Picker，低版本 GET_CONTENT）。 */
    fun galleryIntent(): Intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
        } else {
            Intent(Intent.ACTION_GET_CONTENT)
                .setType("image/*")
                .addCategory(Intent.CATEGORY_OPENABLE)
        }

    /** 取相机结果。取消 / 文件没写出来返回 null。 */
    fun cameraResultUri(resultCode: Int): Uri? {
        if (resultCode != Activity.RESULT_OK) return null
        val file = pendingCameraFile ?: return null
        return if (file.exists() && file.length() > 0) Uri.fromFile(file) else null
    }

    /** 取相册结果。取消 / 没返回 uri 返回 null。 */
    fun galleryResultUri(resultCode: Int, data: Intent?): Uri? =
        if (resultCode != Activity.RESULT_OK) null else data?.data

    /** 清理本次请求状态；deleteCameraFile=true 时顺手删掉临时照片（解码完成后调用）。 */
    fun clearPending(deleteCameraFile: Boolean = true) {
        val file = pendingCameraFile
        pendingCameraFile = null
        if (deleteCameraFile && file != null) {
            try {
                file.delete()
            } catch (t: Throwable) {
                // 临时文件删不掉不影响功能
            }
        }
    }

    /** cache 里的历史照片最多留 24h，避免长期占用空间。 */
    private fun pruneOldFiles(dir: File) {
        val cutoff = System.currentTimeMillis() - CACHE_MAX_AGE_MS
        try {
            dir.listFiles()?.forEach { f ->
                if (f.isFile && f.lastModified() < cutoff) f.delete()
            }
        } catch (t: Throwable) {
            // ignore
        }
    }

    companion object {
        const val DIR_CAMERA = "camera"
        private const val AUTHORITY_SUFFIX = ".fileprovider"
        private const val CACHE_MAX_AGE_MS = 24L * 60 * 60 * 1000
    }
}
