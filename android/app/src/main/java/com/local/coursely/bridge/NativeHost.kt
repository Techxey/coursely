package com.local.coursely.bridge

import android.app.Activity

/**
 * NativeBridge 与宿主的约定：宿主（MainActivity）提供主线程 JS 执行入口和 Activity 引用，
 * 这样 bridge 层不需要认识 WebView 或 Activity 的具体实现。
 */
interface NativeHost {
    /** 主线程执行 JS；内部会切到 UI 线程 */
    fun evaluateJs(js: String)

    /** 拿 Activity 用于 startActivity / requestPermissions */
    fun activity(): Activity
}
