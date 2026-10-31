package app.dragonfly.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores the background check after a restart or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        SyncJob.schedule(context);
        SyncJob.soon(context, 5_000);
    }
}
