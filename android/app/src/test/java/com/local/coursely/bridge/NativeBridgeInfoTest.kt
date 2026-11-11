package com.local.coursely.bridge

import android.app.Activity
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 桥本身的契约单测（Robolectric 提供 org.json / Activity）：
 * info() 必须是合法 JSON、字段齐全；回执走 window.CN._resolve；请求码只消费自己的。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class NativeBridgeInfoTest {

    private class RecordingHost(private val act: Activity) : NativeHost {
        val scripts = ArrayList<String>()
        override fun evaluateJs(js: String) {
            scripts.add(js)
        }

        override fun activity(): Activity = act
    }

    private fun newHost(): RecordingHost =
        RecordingHost(Robolectric.buildActivity(Activity::class.java).setup().get())

    @Test
    fun infoReturnsValidJsonWithExpectedFields() {
        val bridge = NativeBridge(newHost())
        try {
            val json = JSONObject(bridge.info())
            assertEquals("android", json.getString("platform"))
            assertEquals(NativeBridge.VERSION, json.getString("version"))
            assertTrue(json.getInt("sdk") > 0)
            assertTrue(json.getString("device").isNotEmpty())
            assertTrue(json.getBoolean("ocr"))
            assertTrue(
                json.getString("notifications") in setOf("granted", "denied", "default")
            )
        } finally {
            bridge.dispose()
        }
    }

    @Test
    fun resolveCallsTypedCallback() {
        val host = newHost()
        val bridge = NativeBridge(host)
        try {
            bridge.resolve("req-1", true, """{"code":"cancel"}""")
            assertEquals(1, host.scripts.size)
            val js = host.scripts[0]
            assertTrue(js.startsWith("window.CN && window.CN._resolve("))
            assertTrue(js.endsWith(");"))
            assertTrue(js.contains("req-1"))
            assertTrue(js.contains("true"))
        } finally {
            bridge.dispose()
        }
    }

    @Test
    fun onlyOwnRequestCodesAreConsumed() {
        val bridge = NativeBridge(newHost())
        try {
            assertTrue(bridge.onActivityResult(NativeBridge.REQ_CAMERA, Activity.RESULT_CANCELED, null))
            assertTrue(bridge.onActivityResult(NativeBridge.REQ_GALLERY, Activity.RESULT_CANCELED, null))
            assertFalse(bridge.onActivityResult(0x999, Activity.RESULT_OK, null))
            assertTrue(
                bridge.onRequestPermissionsResult(
                    NativeBridge.REQ_NOTIFY,
                    arrayOf("android.permission.POST_NOTIFICATIONS"),
                    intArrayOf(0)
                )
            )
            assertFalse(bridge.onRequestPermissionsResult(0x999, emptyArray(), intArrayOf()))
        } finally {
            bridge.dispose()
        }
    }
}
