package com.tylerhill.shoo;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/** Schedules nags with AlarmManager and shows them. Survives the app being closed; BootReceiver restores them after a restart. */
final class Nags {

    static final String CHANNEL = "shoo_nags";
    static final String ACTION_NAG = "com.tylerhill.shoo.NAG";
    static final String ACTION_LEFT = "com.tylerhill.shoo.LEFT";

    private Nags() {}

    static void schedule(Context ctx, JSONArray nags) {
        cancelAll(ctx);
        long now = System.currentTimeMillis();
        JSONArray kept = new JSONArray();
        for (int i = 0; i < nags.length(); i++) {
            JSONObject nag = nags.optJSONObject(i);
            if (nag == null || nag.optLong("at") <= now) continue;
            arm(ctx, nag);
            kept.put(nag);
        }
        ShooStore.setNags(ctx, kept);
    }

    /** Re-arms what's stored, after a reboot. */
    static void restore(Context ctx) {
        schedule(ctx, ShooStore.nags(ctx));
    }

    static void cancelAll(Context ctx) {
        JSONArray nags = ShooStore.nags(ctx);
        for (int i = 0; i < nags.length(); i++) {
            JSONObject nag = nags.optJSONObject(i);
            if (nag != null) disarm(ctx, nag.optString("id"));
        }
        ShooStore.setNags(ctx, new JSONArray());
    }

    /** Cancels the rest of one shift's nags (you left). */
    static void cancelShift(Context ctx, String shiftId) {
        JSONArray nags = ShooStore.nags(ctx);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < nags.length(); i++) {
            JSONObject nag = nags.optJSONObject(i);
            if (nag == null) continue;
            if (shiftId.equals(nag.optString("shiftId"))) disarm(ctx, nag.optString("id"));
            else kept.put(nag);
        }
        ShooStore.setNags(ctx, kept);
    }

    private static void arm(Context ctx, JSONObject nag) {
        AlarmManager alarms = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent intent = intentFor(ctx, nag.optString("id"))
            .putExtra("title", nag.optString("title"))
            .putExtra("body", nag.optString("body"));
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long at = nag.optLong("at");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
            // Without the exact alarm permission, Android may shift it by up to a minute.
            alarms.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000, pi);
        } else {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void disarm(Context ctx, String id) {
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx, 0, intentFor(ctx, id), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi == null) return;
        ((AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE)).cancel(pi);
        pi.cancel();
    }

    /** The data URI makes each nag's alarm distinct, so it can be cancelled by id. */
    private static Intent intentFor(Context ctx, String id) {
        return new Intent(ctx, NagReceiver.class)
            .setAction(ACTION_NAG)
            .setData(Uri.parse("shoo://nag/" + Uri.encode(id)))
            .putExtra("id", id);
    }

    static void show(Context ctx, String id, String title, String body, boolean withLeftButton) {
        ensureChannel(ctx);
        NotificationManagerCompat manager = NotificationManagerCompat.from(ctx);
        if (!manager.areNotificationsEnabled()) return;

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_shoo)
            .setColor(0xFFFF6B35)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true);
        if (open != null) {
            builder.setContentIntent(PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE));
        }
        if (withLeftButton) {
            Intent left = new Intent(ctx, NagReceiver.class).setAction(ACTION_LEFT);
            builder.addAction(0, "I've left 🚪", PendingIntent.getBroadcast(ctx, 1, left, PendingIntent.FLAG_IMMUTABLE));
        }
        try {
            // One notification at a time: each nag replaces the last.
            manager.notify("shoo", 1, builder.build());
        } catch (SecurityException e) {
            // Notification permission was revoked.
        }
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Nags", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Reminders to leave for work");
        ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
}
