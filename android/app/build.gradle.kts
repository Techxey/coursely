plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.local.coursely"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.local.coursely"
        minSdk = 26
        targetSdk = 34
        versionCode = 9
        versionName = "0.9.0"
        // ABI 由下面的 splits 控制（两者不能同时配置，否则 Gradle 直接报冲突）
    }

    /* ── 瘦身 1：按 ABI 拆包，每个包只带自己的原生库 ── */
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = false
        }
    }

    /* ── 瘦身 2：.so 用压缩存储（AGP 8 默认 stored，APK 更大） ── */
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            /* ── 瘦身 3：R8 代码收缩 + 资源收缩 ── */
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // 个人自用包：release 也用 debug 签名，方便直接安装
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    androidResources {
        noCompress += listOf("webmanifest")
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
    // 离线中文 OCR（模型打包进 APK，不需要网络、不需要 Google Play 服务）
    implementation("com.google.mlkit:text-recognition-chinese:16.0.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.12.2")
    testImplementation("androidx.test:core:1.5.0")
}
