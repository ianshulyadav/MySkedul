package com.myskedul.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/** Saves exports through Android's scoped-storage MediaStore API.
 * Files land in the user-visible Downloads/MySkedulAPP folder without legacy
 * storage permissions, including on Android 10+.
 */
@CapacitorPlugin(name = "PublicDownloads")
public class PublicDownloadsPlugin extends Plugin {
    @PluginMethod
    public void saveBackup(PluginCall call) {
        String filename = call.getString("filename");
        String base64 = call.getString("data");
        if (filename == null || filename.trim().isEmpty() || base64 == null) {
            call.reject("A filename and file data are required.");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/MySkedulAPP");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            ContentResolver resolver = getContext().getContentResolver();
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create the download file.");

            try (OutputStream stream = resolver.openOutputStream(uri)) {
                if (stream == null) throw new IllegalStateException("Could not open the download file.");
                stream.write(bytes);
                stream.flush();
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("path", "Downloads/MySkedulAPP/" + filename);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to save backup to Downloads", error);
        }
    }
}
