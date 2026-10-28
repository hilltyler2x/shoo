package com.tylerhill.shoo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** An alarm went off (show the nag), or someone tapped "I've left". */
public class NagReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Nags.ACTION_LEFT.equals(intent.getAction())) {
            TripMonitor.markLeft(ctx, "button");
            androidx.core.app.NotificationManagerCompat.from(ctx).cancel("shoo", 1);
            return;
        }
        if (Nags.ACTION_NAG.equals(intent.getAction())) {
            Nags.show(ctx, intent.getStringExtra("id"), intent.getStringExtra("title"), intent.getStringExtra("body"), true);
        }
    }
}
