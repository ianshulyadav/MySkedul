# MySkedul ProGuard Rules - Optimized for Performance & Size
# =========================================================

# Capacitor & WebView Bridge
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# Keep JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor Native Bridge and Plugins
-keep class com.getcapacitor.** { *; }
-keep class com.myskedul.app.MainActivity { *; }

# Keep Capacitor Plugin methods (important for save/reload)
-keepclassmembers class ** {
  @com.getcapacitor.PluginMethod public void *(...);
}

# Google Services (if used)
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Cordova Plugins Keep rules
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin
-keep class com.cordova.** { *; }
-keep class com.getcapacitor.community.** { *; }

# General Android common fixes
-keep class androidx.core.app.CoreComponentFactory { *; }
-keep class androidx.core.view.WindowCompat { *; }

# Remove logging in release builds
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Optimization: Remove unused code
-optimizationpasses 5
-allowaccessmodification
-dontpreverify

# WebView optimization
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.os.Bundle);
}

# Capacitor Plugin Interface Optimization
-keep,allowobfuscation,allowshrinking interface * extends com.getcapacitor.Plugin
-keep,allowobfuscation,allowshrinking class * implements com.getcapacitor.Plugin
