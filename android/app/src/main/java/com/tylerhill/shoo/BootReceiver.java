package com.tylerhill.shoo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** A restart wipes alarms and geofences. Put them back. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Nags.restore(ctx);
        JSONObject trip = ShooStore.trip(ctx);
        if (trip != null && !trip.has("arrivedAt")) TripMonitor.register(ctx, trip);
    }
}
