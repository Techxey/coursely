package com.local.coursely.ui

import android.content.pm.PackageManager
import android.view.ViewGroup
import android.webkit.WebView
import com.local.coursely.MainActivity
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
 * 1) Activity 能被创建，WebView 确实加载了本地页面（说明外壳没崩）；
 * 2) 合并后的 manifest 没有 INTERNET 权限（零联网是产品承诺）。
 */
@RunWith(RobolectricTestRunner::class)
class MainActivitySmokeTest {

    @Test
    fun launches_and_loads_local_app_url() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val activity = controller.get()
        assertNotNull("Activity 应能创建", activity)

        val root = activity.findViewById<ViewGroup>(android.R.id.content)
        assertNotNull(root)
        assertTrue("内容视图里应有 WebView", root.childCount >= 1)

        val web = root.getChildAt(0) as WebView
        assertEquals(
            "WebView 应加载 assets 里的本地页面",
            MainActivity.APP_URL,
            shadowOf(web).lastLoadedUrl
        )

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
            "应有通知权限（上课/作业提醒）",
            perms.contains("android.permission.POST_NOTIFICATIONS")
        )
    }
}
