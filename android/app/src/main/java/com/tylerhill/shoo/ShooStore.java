package com.tylerhill.shoo;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** What Shoo's native side remembers between launches: pending nags, the trip being watched, and events for the app. */
final class ShooStore {

    private static final String PREFS = "shoo";

    private ShooStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray nags(Context ctx) {
        return array(ctx, "nags");
    }

    static void setNags(Context ctx, JSONArray nags) {
        prefs(ctx).edit().putString("nags", nags.toString()).apply();
    }

    static JSONObject trip(Context ctx) {
        String raw = prefs(ctx).getString("trip", null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    static void setTrip(Context ctx, JSONObject trip) {
        SharedPreferences.Editor edit = prefs(ctx).edit();
        if (trip == null) edit.remove("trip");
        else edit.putString("trip", trip.toString());
        edit.apply();
    }

    static void addEvent(Context ctx, JSONObject event) {
        JSONArray events = array(ctx, "events");
        events.put(event);
        while (events.length() > 20) events.remove(0);
        prefs(ctx).edit().putString("events", events.toString()).apply();
    }

    static JSONArray takeEvents(Context ctx) {
        JSONArray events = array(ctx, "events");
        prefs(ctx).edit().remove("events").apply();
        return events;
    }

    private static JSONArray array(Context ctx, String key) {
        try {
            return new JSONArray(prefs(ctx).getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
