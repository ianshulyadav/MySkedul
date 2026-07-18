package com.myskedul.app;

import android.os.Bundle;
import android.os.PowerManager;
import android.content.Context;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // EDGE-TO-EDGE & SYSTEM BAR TRANSPARENCY
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);

        // SYNC SYSTEM NAVIGATION ICONS WITH THEME (Dark icons in light theme, light icons in dark theme)
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean isDark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        
        // Modern Method
        controller.setAppearanceLightNavigationBars(!isDark);
        controller.setAppearanceLightStatusBars(!isDark);
        
        // Legacy Method (Double-layer compatibility for older Android versions/specific vendors)
        if (!isDark) {
            getWindow().getDecorView().setSystemUiVisibility(
                getWindow().getDecorView().getSystemUiVisibility() | 
                android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | 
                (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O ? android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0)
            );
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
        
        // Low Battery Optimization...
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager.isPowerSaveMode()) {
            // Your app can listen to...
        }
    }
}
