# Capacitor & WebView Bridge
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.getcapacitor.** { *; }
-keep class com.myskedul.app.MainActivity { *; }

# Google Services (if used)
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep Capacitor Plugin methods (important for save/reload)
-keepclassmembers class ** {
  @com.getcapacitor.PluginMethod public void *(...);
}

# General Android common fixes
-keep class androidx.core.app.CoreComponentFactory { *; }
-keep class androidx.core.view.WindowCompat { *; }
