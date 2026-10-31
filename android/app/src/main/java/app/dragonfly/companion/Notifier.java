package app.dragonfly.companion;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Notifications: a new "needs your attention" item, a finished job, an app
 * update. The first status after sign-in only records what is already there,
 * so nothing old is announced.
 */
final class Notifier {
    static final String ATTENTION = "attention";
    static final String JOBS = "jobs";
    static final String UPDATES = "updates";
    private static final int MAX_EACH_TIME = 3;

    private Notifier() {}

    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(ATTENTION,
                context.getString(R.string.channel_attention), NotificationManager.IMPORTANCE_HIGH));
        manager.createNotificationChannel(new NotificationChannel(JOBS,
                context.getString(R.string.channel_jobs), NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel(UPDATES,
                context.getString(R.string.channel_updates), NotificationManager.IMPORTANCE_LOW));
    }

    static void onSnapshot(Context context, JSONObject device, JSONObject snapshot, boolean notify) {
        SharedPreferences state = Store.state(context);
        String scope = device.optString("id") + ":";
        boolean seeded = state.getBoolean("seeded:" + device.optString("id"), false);

        Set<String> seen = new HashSet<>(state.getStringSet("attention_seen", new HashSet<>()));
        Set<String> nowIds = new HashSet<>();
        int sent = 0;
        int more = 0;
        JSONArray attention = snapshot.optJSONArray("attention");
        if (attention != null) {
            for (int i = 0; i < attention.length(); i++) {
                JSONObject item = attention.optJSONObject(i);
                if (item == null) continue;
                String raw = item.isNull("id") ? "" : item.optString("id", "");
                String id = scope + (raw.isEmpty() ? "#" + i + ":" + item.optString("title", "") : raw);
                nowIds.add(id);
                if (seen.contains(id)) continue;
                if (!seeded || !notify) continue;
                if (sent < MAX_EACH_TIME) {
                    show(context, ATTENTION, id.hashCode(), item.optString("title", "Needs your attention"),
                            item.optString("detail", ""), openApp(context));
                    sent++;
                } else {
                    more++;
                }
            }
        }
        if (more > 0) {
            show(context, ATTENTION, (scope + "more").hashCode(),
                    more == 1 ? "1 more thing needs your attention" : more + " more things need your attention",
                    "Open Dragonfly to see them.", openApp(context));
        }
        // Forget items that went away, so they are announced again if they come back.
        Set<String> keep = new HashSet<>();
        for (String id : seen) if (!id.startsWith(scope)) keep.add(id);
        keep.addAll(nowIds);

        SharedPreferences.Editor edit = state.edit().putStringSet("attention_seen", keep);
        JSONArray jobs = snapshot.optJSONArray("jobs");
        if (jobs != null) {
            for (int i = 0; i < jobs.length(); i++) {
                JSONObject job = jobs.optJSONObject(i);
                if (job == null) continue;
                String key = "job:" + scope + job.optString("id");
                String before = state.getString(key, null);
                String after = job.optString("state", "");
                edit.putString(key, after);
                if (seeded && notify && "done".equals(after) && before != null && !"done".equals(before)) {
                    int uploaded = job.optInt("uploaded", 0);
                    show(context, JOBS, key.hashCode(), job.optString("archive", "Upload job") + ": finished",
                            uploaded == 1 ? "1 video uploaded." : uploaded + " videos uploaded.", openApp(context));
                }
            }
        }
        edit.putBoolean("seeded:" + device.optString("id"), true).apply();
    }

    static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent openUrl(Context context, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void show(Context context, String channel, int id, String title, String text, PendingIntent tap) {
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        createChannels(context);
        Notification notification = new Notification.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(context.getColor(R.color.accent))
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        context.getSystemService(NotificationManager.class).notify(id, notification);
    }
}
