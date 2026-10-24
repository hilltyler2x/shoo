package com.tylerhill.shoo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import org.json.JSONException;
import org.json.JSONObject;

/** Geofences around where you are and where you work: leaving cancels the nags, arriving celebrates. */
final class TripMonitor {

    static final String ORIGIN = "shoo.origin";
    static final String JOB = "shoo.job";

    private TripMonitor() {}

    static void watch(Context ctx, JSONObject trip) {
        JSONObject current = ShooStore.trip(ctx);
        if (current != null && current.optString("shiftId").equals(trip.optString("shiftId"))
            && (current.has("leftAt") || current.has("arrivedAt"))) {
            return; // already on the way; don't reset
        }
        ShooStore.setTrip(ctx, trip);
        register(ctx, trip);
    }

    /** Adds the geofences for a stored trip. Also used after a reboot, which clears them. */
    @SuppressLint("MissingPermission")
    static void register(Context ctx, JSONObject trip) {
        if (!hasLocation(ctx)) return;
        JSONObject origin = trip.optJSONObject("origin");
        JSONObject job = trip.optJSONObject("job");
        if (origin == null || job == null) return;
        float radius = (float) Math.max(100, trip.optDouble("radius", 150));

        GeofencingRequest.Builder request = new GeofencingRequest.Builder().setInitialTrigger(0);
        if (!trip.has("leftAt")) {
            request.addGeofence(fence(ORIGIN, origin, radius, Geofence.GEOFENCE_TRANSITION_EXIT));
        }
        request.addGeofence(fence(JOB, job, radius, Geofence.GEOFENCE_TRANSITION_ENTER));
        LocationServices.getGeofencingClient(ctx).addGeofences(request.build(), pendingIntent(ctx));
    }

    static void clear(Context ctx) {
        LocationServices.getGeofencingClient(ctx).removeGeofences(pendingIntent(ctx));
        ShooStore.setTrip(ctx, null);
    }

    static void markLeft(Context ctx, String source) {
        JSONObject trip = ShooStore.trip(ctx);
        if (trip == null || trip.has("leftAt")) return;
        long now = System.currentTimeMillis();
        if ("geofence".equals(source) && now < trip.optLong("watchFrom")) return;
        put(trip, "leftAt", now);
        ShooStore.setTrip(ctx, trip);
        Nags.cancelShift(ctx, trip.optString("shiftId"));
        JSONObject event = event("left", trip, now);
        put(event, "source", source);
        record(ctx, event);
    }

    static void markArrived(Context ctx) {
        JSONObject trip = ShooStore.trip(ctx);
        if (trip == null || trip.has("arrivedAt")) return;
        long now = System.currentTimeMillis();
        if (now < trip.optLong("watchFrom")) return;
        put(trip, "arrivedAt", now);
        if (!trip.has("leftAt")) put(trip, "leftAt", now);
        ShooStore.setTrip(ctx, trip);
        Nags.cancelShift(ctx, trip.optString("shiftId"));
        LocationServices.getGeofencingClient(ctx).removeGeofences(pendingIntent(ctx));
        boolean onTime = now <= trip.optLong("shiftStart");
        Nags.show(ctx, "arrived", trip.optString("celebrateTitle"),
            trip.optString(onTime ? "onTimeBody" : "lateBody"), false);
        JSONObject event = event("arrived", trip, now);
        put(event, "onTime", onTime);
        record(ctx, event);
    }

    private static Geofence fence(String id, JSONObject at, float radius, int transition) {
        return new Geofence.Builder()
            .setRequestId(id)
            .setCircularRegion(at.optDouble("lat"), at.optDouble("lng"), radius)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(transition)
            .build();
    }

    private static PendingIntent pendingIntent(Context ctx) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Geofencing fills in the event, so the intent has to be mutable.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(ctx, 0, new Intent(ctx, GeofenceReceiver.class), flags);
    }

    static boolean hasLocation(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private static JSONObject event(String type, JSONObject trip, long at) {
        JSONObject event = new JSONObject();
        put(event, "type", type);
        put(event, "shiftId", trip.optString("shiftId"));
        put(event, "at", at);
        return event;
    }

    private static void record(Context ctx, JSONObject event) {
        ShooStore.addEvent(ctx, event);
        ShooNativePlugin.emit(event);
    }

    private static void put(JSONObject o, String key, Object value) {
        try {
            o.put(key, value);
        } catch (JSONException ignored) {
            // keys are constants; can't happen
        }
    }
}
