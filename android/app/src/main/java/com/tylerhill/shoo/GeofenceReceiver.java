package com.tylerhill.shoo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

public class GeofenceReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError() || event.getTriggeringGeofences() == null) return;
        for (Geofence fence : event.getTriggeringGeofences()) {
            String id = fence.getRequestId();
            int transition = event.getGeofenceTransition();
            if (TripMonitor.ORIGIN.equals(id) && transition == Geofence.GEOFENCE_TRANSITION_EXIT) {
                TripMonitor.markLeft(ctx, "geofence");
            } else if (TripMonitor.JOB.equals(id) && transition == Geofence.GEOFENCE_TRANSITION_ENTER) {
                TripMonitor.markArrived(ctx);
            }
        }
    }
}
