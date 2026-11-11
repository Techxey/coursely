package com.local.coursely

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import com.local.coursely.bridge.NativeBridge
import com.local.coursely.bridge.NativeHost
import com.local.coursely.splash.SplashView

/**
 * 课序 · Android 外壳
 *
 * 启动顺序：系统开屏 → 品牌开屏（逐笔描绘 + 涟漪 + 进度条）→ 淡出露出 WebView。
 * UI 复用已验证的 PWA 页面（assets/www），通过 WebViewAssetLoader 以
 * https://appassets.androidplatform.net 这个安全源提供，保证 localStorage 持久化。
 */
class MainActivity : Activity(), NativeHost {

    companion object {
        const val APP_URL = "https://appassets.androidplatform.net/assets/www/index.html"
        private const val PREFS = "coursely_ui"
        private const val KEY_SPLASH_SHOWN = "splash_shown"
    }

    private lateinit var web: WebView
    private var bridge: NativeBridge? = null

    private var splash: SplashView? = null
    private var pageReady = false
    private var introDone = false
    private var exiting = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(0x00FFFFFF) // 透明，露出主题背景，避免启动白闪
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mediaPlaybackRequiresUserGesture = true
                textZoom = 100
                useWideViewPort = true
                loadWithOverviewMode = false
                allowFileAccess = false
                allowContentAccess = false
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ) = loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean = true // 不允许跳出应用内页面

                override fun onPageFinished(view: WebView, url: String) {
                    if (url.contains("index.html")) {
                        pageReady = true
                        maybeExit()
                    }
                }
            }
        }

        val b = NativeBridge(this)
        bridge = b
        web.addJavascriptInterface(b, "CourselyNative")

        val root = FrameLayout(this)
        root.addView(web, matchParent())
        setContentView(root)

        // 只在冷启动时播；第二次及以后用「快闪版」，避免每次等待
        if (savedInstanceState == null) {
            val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
            val fast = prefs.getBoolean(KEY_SPLASH_SHOWN, false)
            val sv = SplashView(this)
            sv.onIntroDone = {
                introDone = true
                maybeExit()
            }
            sv.onExitDone = {
                (sv.parent as? ViewGroup)?.removeView(sv)
                if (splash === sv) splash = null
            }
            root.addView(sv, matchParent())
            splash = sv
            sv.start(fast)
            prefs.edit().putBoolean(KEY_SPLASH_SHOWN, true).apply()

            // 兜底：万一页面没回报 ready，2.8s 后也把开屏收掉
            root.postDelayed({
                if (!exiting) {
                    introDone = true
                    maybeExit(force = true)
                }
            }, 2800L)
        }

        web.loadUrl(APP_URL)
    }

    private fun matchParent() = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    )

    /** 开场播完 + 页面就绪，才收场（或强制收场） */
    private fun maybeExit(force: Boolean = false) {
        val sv = splash ?: return
        if (exiting) return
        if (!force && !(introDone && pageReady)) return
        exiting = true
        sv.playExit()
    }

    /* ── NativeHost ─────────────────────────────────────── */

    override fun evaluateJs(js: String) {
        runOnUiThread {
            if (!isFinishing && !isDestroyed && this::web.isInitialized) {
                web.evaluateJavascript(js, null)
            }
        }
    }

    override fun activity(): Activity = this

    /* ── Activity 回调转发给 bridge ──────────────────────── */

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        val handled = bridge?.onActivityResult(requestCode, resultCode, data) == true
        if (!handled) {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        val handled = bridge?.onRequestPermissionsResult(requestCode, permissions, grantResults) == true
        if (!handled) {
            @Suppress("DEPRECATION")
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    /* ── 返回键：先交给网页（关弹层 / 回今日），未消费则退出 ── */

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!this::web.isInitialized) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
            return
        }
        web.evaluateJavascript(
            "(function(){try{return (window.CourselyBack && window.CourselyBack())?'1':'0';}catch(e){return '0';}})()"
        ) { result ->
            if (result == null || result.contains("0")) {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onDestroy() {
        bridge?.dispose()
        bridge = null
        if (this::web.isInitialized) {
            web.removeJavascriptInterface("CourselyNative")
            web.destroy()
        }
        super.onDestroy()
    }
}
