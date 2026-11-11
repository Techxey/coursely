# 课序 Android · 原生桥接契约（BRIDGE CONTRACT）

> 项目根：`android/`　网页源码真身在：`web/`（改完用 `tools/sync-web.ps1` 同步到 `app/src/main/assets/www`）

## 0. 架构一句话

**WebView 装已验证的 iOS 风格 UI**（`https://appassets.androidplatform.net/assets/www/index.html`，
由 `WebViewAssetLoader` 提供 → 安全源 → localStorage 可持久化），
**Kotlin 只做网页做不到的三件事**：拍照、离线 OCR、后台提醒。

工具链（已在本机验证可用）：
```powershell
$env:JAVA_HOME="<JDK-17 路径>"
$env:ANDROID_HOME="<Android SDK 路径>"
$env:GRADLE_USER_HOME="<Gradle 缓存目录>"
.\gradlew assembleDebug --no-daemon --console=plain
```
当前基线：AGP 8.5.2 / Kotlin 1.9.24 / Gradle 8.7 / compileSdk 34 / minSdk 26，**build 绿，APK 41.9MB**（含中文 OCR 模型）。

---

## 1. 文件所有权（严格）

| 路径 | 负责人 |
|---|---|
| `app/src/main/java/com/local/coursely/MainActivity.kt` | **Lead** |
| `app/src/main/java/com/local/coursely/bridge/NativeHost.kt` | **Lead** |
| `app/build.gradle.kts` `AndroidManifest.xml` `res/**` | **Lead** |
| `app/src/main/java/com/local/coursely/bridge/NativeBridge.kt` | **andro-native** |
| `app/src/main/java/com/local/coursely/photo/*.kt` | **andro-native** |
| `app/src/main/java/com/local/coursely/ocr/*.kt` | **andro-native** |
| `app/src/main/java/com/local/coursely/reminder/*.kt` | **andro-native** |
| `js/pages/me.js`（导入流程原生分支）、`css/me.css` | **web-native** |
| `js/android.js`、`index.html`、`js/app.js` 等其它网页文件 | **Lead** |

**不要**改 `android/\app\src\main\assets\www\**`（构建产物，会被覆盖）；
要改网页就改 `web/\**` 的真身。

---

## 2. Kotlin 侧必须提供的类与签名

### 2.1 `bridge/NativeHost.kt`（Lead 已写，你直接用）

```kotlin
package com.local.coursely.bridge

interface NativeHost {
    fun evaluateJs(js: String)   // 主线程 evaluateJavascript
    fun activity(): android.app.Activity
}
```

### 2.2 `bridge/NativeBridge.kt`（你写）

```kotlin
package com.local.coursely.bridge

class NativeBridge(private val host: NativeHost) {

    @android.webkit.JavascriptInterface
    fun req(id: String, method: String, payload: String)

    @android.webkit.JavascriptInterface
    fun info(): String   // 同步返回 JSON 字符串

    /** MainActivity.onActivityResult 转发进来；返回 true 表示已消费 */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?): Boolean

    /** MainActivity.onRequestPermissionsResult 转发进来；返回 true 表示该请求码由 bridge 消费 */
    fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ): Boolean

    fun dispose()
}
```

`req` 内部按 `method` 分发，完成后**必须**回调网页：

```kotlin
host.evaluateJs("window.CN._resolve(${JSONObject.quote(id)}, ${ok}, ${JSONObject.quote(jsonText)})")
```
> 注意：`evaluateJs` 在主线程执行；OCR/解码等耗时操作放 `Executors.newSingleThreadExecutor()`，
> 回调前 `host.activity().runOnUiThread { ... }`。

### 2.3 `info()` 返回（JSON 字符串）

```json
{"platform":"android","version":"0.1.0","sdk":34,"device":"Pixel 6","ocr":true,
 "notifications":"granted"}
```
`notifications` ∈ `granted | denied | default`（`POST_NOTIFICATIONS` 状态；<13 恒为 `granted`）。

---

## 3. 方法协议（`method` → payload → 回执 JSON）

| method | payload | 成功回执 |
|---|---|---|
| `vibrate` | `{"ms":10}` | `{}`（快捷路径，可不回执） |
| `pickPhoto` | `{"source":"camera"\|"gallery"}` | `{"dataUrl":"data:image/jpeg;base64,...","width":1200,"height":1600}` ；取消 → `{"code":"cancel"}` |
| `ocr` | `{"dataUrl":"data:image/jpeg;base64,..."}` | `{"width":1200,"height":1600,"lines":[{"text":"高等数学（上）","x":0.12,"y":0.31,"w":0.22,"h":0.05,"size":42}]}` |
| `syncReminders` | `{"items":[{"id":"c|xxx|2026-11-09","atMs":1762…,"title":"还有 10 分钟上课","body":"数据结构 · 教三-201 · 2 节"}]}` | `{"scheduled":12,"exact":true}` |
| `requestNotifications` | `{}` | `{"granted":true}` |
| `setStatusBar` | `{"dark":false}` | `{}` |

**坐标约定（OCR，重要）**：`x/y/w/h` 全部是**图片的归一化比例 0–1**，原点在左上角；`size` 是文字高度（像素），用来区分标题字与教室小字。

失败回执：`{"code":"permission_denied" | "no_camera" | "decode_failed" | "ocr_failed" | "cancel"}`，同时 `ok=false`。

---

## 4. 各模块实现要点

### 4.1 拍照 / 选图（`photo/PhotoPicker.kt`）

- **相机**：不申请 `CAMERA` 权限（用系统相机 App 代拍，避免权限弹窗）。
  建临时文件 `context.cacheDir/camera/xxx.jpg` → `FileProvider.getUriForFile(context, "${packageName}.fileprovider", file)`
  → `Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)` + `addFlags(FLAG_GRANT_WRITE_URI_PERMISSION)`。
  FileProvider 的 authority 已在 Manifest 配好，路径 `cache-path name="camera" path="camera/"`。
- **相册**：`Intent(MediaStore.ACTION_PICK_IMAGES)`（API 33+）降级 `Intent.ACTION_GET_CONTENT` `type="image/*"`。
- 结果统一：`ImageUtils.loadScaled(uri, maxSide = 1600)` → JPEG 质量 85 → `Base64.encodeToString(bytes, NO_WRAP)` → 前面拼 `data:image/jpeg;base64,`。
- **请求码常量**：`REQ_CAMERA = 0x501`，`REQ_GALLERY = 0x502`，`REQ_NOTIFY = 0x503`。
- 同一时刻只允许一个未完成的 `pickPhoto`；新请求覆盖旧请求（旧请求回 `{"code":"cancel"}`）。

### 4.2 离线 OCR（`ocr/OcrEngine.kt`）

```kotlin
private val recognizer by lazy {
    TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
}
```
- 输入 `Bitmap` → `InputImage.fromBitmap(bitmap, 0)` → `recognizer.process(image)`
- 遍历 `result.textBlocks` 的 `lines`：`boundingBox` 转归一化坐标，`text` 去空白。
- **过滤**：文本长度 0 或纯符号的丢掉；`size` = box.height()。
- 结束时 `recognizer.close()`（在 `dispose()` 里）。
- 整个过程放后台线程；超时 20s 回 `{"code":"ocr_failed"}`。

### 4.3 后台提醒（`reminder/`）

- `Notifications.ensureChannel(context)`：channel id `reminders`，重要性 `IMPORTANCE_HIGH`，中文名「上课与作业提醒」。
- `ReminderScheduler.sync(context, items)`：
  1. 读出上轮排过的 id 列表（`SharedPreferences`），全部 `cancel()`；
  2. 逐个 `PendingIntent.getBroadcast(context, requestCode, intent, FLAG_IMMUTABLE or FLAG_UPDATE_CURRENT)`；
     requestCode 用 `id.hashCode()` 保证唯一稳定；
  3. 能精确就精确：`alarmManager.canScheduleExactAlarms()`（API 31+）→ `setExactAndAllowWhileIdle(RTC_WAKEUP, …)`，
     否则 `setAndAllowWhileIdle`；回执里 `exact` 反映真实情况；
  4. 保存本轮 id，返回 `{"scheduled":n,"exact":bool}`。
- `ReminderReceiver`：`onReceive` → `Notifications.show(context, title, body)`（`NotificationCompat`？**没有 appcompat 依赖**，
  用原生 `Notification.Builder(context, channelId)` + `setSmallIcon(R.drawable.ic_launcher_foreground)` 即可）。
  点击通知打开 `MainActivity`。
- `BootReceiver`：收到 `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` 后**重新排提醒**——网页数据在 localStorage 里取不到，
  所以方案是：开机后发一条「打开课序以恢复提醒」的静默通知？**不要这么做**。
  正确做法：`ReminderScheduler` 在每次 sync 时把 `items` 也序列化存进 SharedPreferences（`reminders.json`），
  `BootReceiver` 读这份缓存重新排。**请按这个实现**。
- `POST_NOTIFICATIONS`：API 33+ 需要运行时权限，`requestNotifications` 走 `ActivityCompat.requestPermissions`
  （`androidx.core` 已有，不在依赖里额外加）。

### 4.4 依赖

`com.google.mlkit:text-recognition-chinese:16.0.0` **已加进 build.gradle.kts**；
`NotificationCompat` 属于 androidx.core，可用。**不要改 build.gradle.kts**（要加依赖先找 Lead）。

---

## 5. 网页侧协议（web-native 用）

`window.App.native`（Lead 已在 `js/android.js` 实现）：

```js
App.native.available        // bool，Android 包内为 true
App.native.info             // {platform, sdk, device, ocr, notifications}
App.native.pickPhoto('camera'|'gallery')  // Promise<{dataUrl,width,height}>  取消会 reject({code:'cancel'})
App.native.ocr(dataUrl)                   // Promise<{width,height,lines:[{text,x,y,w,h,size}]}>
App.native.syncReminders(items)           // 已由 android.js 自动接管，页面不用调
App.native.requestNotifications()         // Promise<{granted}>
```

`js/android.js` 已经做了这些（不要重复实现）：
- 震动接管 `App.ui.haptic`
- 状态栏跟随深浅色
- 课程/待办提醒自动同步（数据变化后 1.2s 去抖重排）
- `window.CourselyBack()`：先关 sheet，再回「今日」
- 浏览器环境下整体降级为 no-op

---

## 6. 自检（必须）

1. `assembleDebug` 通过（你只写 Kotlin，编译错误自己修）；
2. 加 `app/src/test/java/com/local/coursely/` 下的 **Robolectric 单测**覆盖纯逻辑：
   - `ReminderScheduler` 的 requestCode/去重逻辑（抽成可测纯函数）
   - OCR 结果 → 行结构的坐标归一化（抽成纯函数）
   - `NativeBridge.info()` 的 JSON 合法性
3. `gradle testDebugUnitTest` 通过（注意：**中文路径下 Robolectric 可能报 ClassNotFoundException**，
   若踩到就在 README 记录，不必强行修；不要为此把工程挪到英文路径）。
