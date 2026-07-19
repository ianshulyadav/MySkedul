# Capacitor & WebView Bridge
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes JavascriptInterface

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
