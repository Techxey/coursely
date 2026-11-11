# 课序 · R8 规则
# 目标：既能收缩体积，又不打断 WebView 桥 / ML Kit 的反射与 JNI

# 本工程全部类保留（我们自己的代码量很小，主要是保住 @JavascriptInterface 的桥接方法）
-keep class com.local.coursely.** { *; }

# WebView JS 桥：方法名不能被混淆，否则 window.CourselyNative 调不到
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.local.coursely.bridge.NativeBridge {
    public void req(java.lang.String, java.lang.String, java.lang.String);
    public java.lang.String info();
}

# ML Kit / TFLite：模型与解释器通过反射 + JNI 加载，保留类名
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class com.google.android.gms.internal.vision.** { *; }
-keep class org.tensorflow.lite.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn org.tensorflow.lite.**

# WebView / AndroidX
-keepclassmembers class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# 小组件：RemoteViews 通过类名 + PendingIntent 反射实例化
-keep class com.local.coursely.widget.** { *; }

# 保留行号，崩溃栈可读（体积影响很小）
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
