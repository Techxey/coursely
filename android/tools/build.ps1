# 构建课序 Android 的两种包（开发用）
#   开发包：单包全 ABI，不混淆，体积大；方便调试
#   发布包：按 ABI 拆分 + R8 + 资源收缩 + .so 压缩，体积小
#
# 前置：JDK 17、Android SDK（platform 34 / build-tools 34）
#   $env:JAVA_HOME      = "C:\path\to\jdk-17"
#   $env:ANDROID_HOME   = "C:\path\to\android-sdk"
#
# 用法：powershell -ExecutionPolicy Bypass -File tools\build.ps1 [-Mode debug|release|both]

param(
    [ValidateSet("debug", "release", "both")]
    [string]$Mode = "release"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $env:JAVA_HOME) { throw "请先设置 JAVA_HOME 指向 JDK 17" }
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    throw "请先设置 ANDROID_HOME（或 ANDROID_SDK_ROOT）指向 Android SDK"
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }

# 优先用工程自带的 wrapper，其次用 PATH 里的 gradle
$wrapper = Join-Path $projectRoot "gradlew.bat"
$gradle = if (Test-Path $wrapper) { $wrapper } else { "gradle" }
Write-Host "gradle: $gradle"
Write-Host "JAVA_HOME: $env:JAVA_HOME"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

Set-Location $projectRoot

# 1) 同步网页真身到 assets/www
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-web.ps1")

# 2) 编译
$tasks = switch ($Mode) {
    "debug" { @("assembleDebug") }
    "release" { @("assembleRelease") }
    default { @("assembleDebug", "assembleRelease") }
}
& $gradle @tasks --console=plain

# 3) 汇总产物
Write-Host ""
Write-Host "=== 产物 ===" -ForegroundColor Green
foreach ($dir in @("debug", "release")) {
    $p = Join-Path $projectRoot "app\build\outputs\apk\$dir"
    if (-not (Test-Path $p)) { continue }
    Get-ChildItem "$p\*.apk" | ForEach-Object {
        "{0,-34} {1,7:N2} MB" -f $_.Name, ($_.Length / 1MB)
    }
}
