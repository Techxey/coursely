package com.local.coursely.ui

import android.content.pm.PackageManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.local.coursely.MainActivity
import com.local.coursely.splash.SplashView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/**
 * 没有真机/模拟器时的兜底验证：
 * 1) Activity 能创建，冷启动时挂上了品牌开屏，WebView 加载的是本地页面；
 * 2) 合并后的 manifest 没有 INTERNET 权限（「零联网」是产品承诺，用测试守住）。
 *
 * 注意：加了开屏之后，content 的第一层是 FrameLayout（WebView + SplashView），
 * 所以这里按类型递归找视图，而不是硬取 childAt(0)。
 */
@RunWith(RobolectricTestRunner::class)
class MainActivitySmokeTest {

    private fun <T : View> findView(root: View, cls: Class<T>): T? {
        if (cls.isInstance(root)) return cls.cast(root)
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                findView(root.getChildAt(i), cls)?.let { return it }
            }
        }
        return null
    }

    @Test
    fun launches_with_splash_and_webview() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val activity = controller.get()
        assertNotNull("Activity 应能创建", activity)

        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        assertNotNull("内容视图应存在", content)

        val web = findView(content, WebView::class.java)
        assertNotNull("应存在 WebView", web)
        assertEquals(
            "WebView 应加载 assets 里的本地页面",
            MainActivity.APP_URL,
            shadowOf(web!!).lastLoadedUrl
        )

        assertNotNull("冷启动应挂上品牌开屏", findView(content, SplashView::class.java))

        controller.pause().stop().destroy()
    }

    @Test
    fun merged_manifest_has_no_internet_permission() {
        val ctx = RuntimeEnvironment.getApplication()
        val info = ctx.packageManager.getPackageInfo(
            ctx.packageName,
            PackageManager.GET_PERMISSIONS
        )
        val perms = info.requestedPermissions?.toList() ?: emptyList()

        assertFalse("课序不应申请 INTERNET", perms.contains("android.permission.INTERNET"))
        assertFalse(
            "课序不应申请 ACCESS_NETWORK_STATE",
            perms.contains("android.permission.ACCESS_NETWORK_STATE")
        )
        assertTrue(
            "应有通知权限（作业到期提醒）",
            perms.contains("android.permission.POST_NOTIFICATIONS")
        )
    }
}
