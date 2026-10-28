package com.tylerhill.shoo;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** The bridge between the web app and Shoo's native nags and geofences. Same API as the iPhone version. */
@CapacitorPlugin(
    name = "ShooNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "backgroundLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
    }
)
public class ShooNativePlugin extends Plugin {

    private static WeakReference<ShooNativePlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        Nags.ensureChannel(getContext());
    }

    /** Tells the web app about a trip event if it's running. Events are also stored for takeTripEvents. */
    static void emit(JSONObject event) {
        ShooNativePlugin plugin = instance.get();
        if (plugin == null) return;
        try {
            plugin.notifyListeners("trip", new JSObject(event.toString()));
        } catch (JSONException ignored) {
            // event is built from valid JSON
        }
    }

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", notificationState());
        result.put("backgroundLocation", backgroundLocationState());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            permissionStatus(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "afterNotifications");
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        permissionStatus(call);
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocation");
        } else {
            afterLocation(call);
        }
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        boolean needsBackground = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && getPermissionState("location") == PermissionState.GRANTED
            && getPermissionState("backgroundLocation") != PermissionState.GRANTED;
        if (needsBackground) {
            // Android shows this as a trip to Settings → Location → "Allow all the time".
            requestPermissionForAlias("backgroundLocation", call, "afterBackground");
        } else {
            permissionStatus(call);
        }
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        permissionStatus(call);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", getContext().getPackageName(), null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private String notificationState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState state = getPermissionState("notifications");
            if (state != PermissionState.GRANTED) return state == PermissionState.DENIED ? "denied" : "prompt";
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
    }

    private String backgroundLocationState() {
        PermissionState foreground = getPermissionState("location");
        if (foreground != PermissionState.GRANTED) return foreground == PermissionState.DENIED ? "denied" : "prompt";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "granted";
        return getPermissionState("backgroundLocation") == PermissionState.GRANTED ? "granted" : "when-in-use";
    }

    @PluginMethod
    public void scheduleNags(PluginCall call) {
        Nags.schedule(getContext(), call.getArray("nags", new JSArray()));
        call.resolve();
    }

    @PluginMethod
    public void cancelAllNags(PluginCall call) {
        Nags.cancelAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void showNow(PluginCall call) {
        Nags.show(getContext(), "now", call.getString("title", "Shoo"), call.getString("body", ""), false);
        call.resolve();
    }

    @PluginMethod
    public void watchTrip(PluginCall call) {
        JSObject origin = call.getObject("origin");
        JSObject job = call.getObject("job");
        String shiftId = call.getString("shiftId");
        if (origin == null || job == null || shiftId == null) {
            call.reject("watchTrip needs shiftId, shiftStart, origin and job");
            return;
        }
        JSObject trip = new JSObject();
        trip.put("shiftId", shiftId);
        trip.put("shiftStart", call.getDouble("shiftStart", 0d).longValue());
        trip.put("watchFrom", call.getDouble("watchFrom", 0d).longValue());
        trip.put("radius", call.getDouble("radius", 150d));
        trip.put("origin", origin);
        trip.put("job", job);
        trip.put("celebrateTitle", call.getString("celebrateTitle", "Made it"));
        trip.put("onTimeBody", call.getString("onTimeBody", ""));
        trip.put("lateBody", call.getString("lateBody", ""));
        TripMonitor.watch(getContext(), trip);
        call.resolve();
    }

    @PluginMethod
    public void clearTrip(PluginCall call) {
        TripMonitor.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void markLeft(PluginCall call) {
        TripMonitor.markLeft(getContext(), "app");
        call.resolve();
    }

    @PluginMethod
    public void takeTripEvents(PluginCall call) {
        JSArray events = new JSArray();
        JSONArray stored = ShooStore.takeEvents(getContext());
        for (int i = 0; i < stored.length(); i++) events.put(stored.opt(i));
        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }
}
