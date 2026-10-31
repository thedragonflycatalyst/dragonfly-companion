package app.dragonfly.companion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Date;

/**
 * Home-screen widget: the computer, what is uploading or next, the queue and
 * today's uploads left, anything that needs attention, and Stop / Start.
 * Stop and Start are sent as commands; the computer applies its usual checks.
 */
public class StatusWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.dragonfly.companion.REFRESH";
    static final String ACTION_TOGGLE = "app.dragonfly.companion.TOGGLE";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        renderAll(context);
        SyncJob.schedule(context);
        SyncJob.soon(context, 1_000);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            // The refresh itself runs as a job: a broadcast only has a few seconds.
            Store.state(context).edit().putString("sending", "Refreshing…").apply();
            renderAll(context);
            SyncJob.soon(context, 0);
            return;
        }
        if (ACTION_TOGGLE.equals(action)) {
            String kind = intent.getStringExtra("kind");
            String deviceId = intent.getStringExtra("device");
            if (!"queue.pause".equals(kind) && !"queue.resume".equals(kind) || deviceId == null) return;
            Store.state(context).edit()
                    .putString("sending", "queue.pause".equals(kind) ? "Stopping…" : "Starting…").apply();
            renderAll(context);
            PendingResult pending = goAsync();
            new Thread(() -> {
                String result = null;
                try {
                    Api.sendCommand(context.getApplicationContext(), deviceId, kind);
                } catch (Api.NotSignedIn e) {
                    result = "Open Dragonfly to sign in";
                } catch (Exception e) {
                    result = "Couldn't send. Try again.";
                } finally {
                    SharedPreferences.Editor edit = Store.state(context).edit().remove("sending");
                    if (result != null) edit.putString("error", result);
                    edit.apply();
                    renderAll(context);
                    SyncJob.soon(context, 4_000);
                    pending.finish();
                }
            }).start();
            return;
        }
        super.onReceive(context, intent);
    }

    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StatusWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static PendingIntent broadcast(Context context, int code, Intent intent) {
        intent.setClass(context, StatusWidget.class);
        return PendingIntent.getBroadcast(context, code, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        views.setOnClickPendingIntent(R.id.widget_root, Notifier.openApp(context));
        views.setOnClickPendingIntent(R.id.w_refresh, broadcast(context, 10, new Intent(ACTION_REFRESH)));
        views.setViewVisibility(R.id.w_toggle, View.GONE);
        views.setViewVisibility(R.id.w_progress, View.GONE);
        views.setViewVisibility(R.id.w_attention, View.GONE);

        SharedPreferences state = Store.state(context);
        String sending = state.getString("sending", null);
        if (!Store.signedIn(context) || state.getBoolean("signed_out", false)) {
            views.setTextViewText(R.id.w_device, "Dragonfly");
            views.setInt(R.id.w_dot, "setColorFilter", context.getColor(R.color.text_muted));
            views.setTextViewText(R.id.w_headline, "Open Dragonfly to sign in");
            views.setTextViewText(R.id.w_detail, "Tap here, then sign in with your Dragonfly account.");
            views.setTextViewText(R.id.w_quota, "");
            return views;
        }
        try {
            String deviceJson = state.getString("device_json", null);
            if (deviceJson == null) {
                views.setTextViewText(R.id.w_device, "Dragonfly");
                views.setTextViewText(R.id.w_headline, "No computer yet");
                views.setTextViewText(R.id.w_detail,
                        "On your computer: Accounts → Phone companion → Share status with my phone.");
                views.setTextViewText(R.id.w_quota, errorOr(state, sending, ""));
                return views;
            }
            JSONObject device = new JSONObject(deviceJson);
            long now = System.currentTimeMillis();
            boolean online = StatusSync.online(device, now);
            views.setTextViewText(R.id.w_device,
                    device.optString("name", "Computer") + (online ? " · Online" : " · Offline"));
            views.setInt(R.id.w_dot, "setColorFilter",
                    context.getColor(online ? R.color.ok : R.color.text_muted));

            String snapshotJson = state.getString("snapshot_json", null);
            if (snapshotJson == null) {
                views.setTextViewText(R.id.w_headline, "No status yet");
                views.setTextViewText(R.id.w_detail, "Turn on Share status with my phone on your computer.");
                views.setTextViewText(R.id.w_quota, errorOr(state, sending, ""));
                return views;
            }
            JSONObject snapshot = new JSONObject(snapshotJson);
            JSONObject queue = snapshot.optJSONObject("queue");
            boolean running = queue != null && queue.optBoolean("running", false);
            JSONObject current = queue == null ? null : queue.optJSONObject("current");
            JSONObject next = queue == null ? null : queue.optJSONObject("next");

            if (current != null) {
                views.setTextViewText(R.id.w_headline, "Uploading " + numbered(current));
                views.setTextViewText(R.id.w_detail, current.optString("archive", ""));
                long sent = current.optLong("bytesSent", 0);
                long total = current.optLong("totalBytes", 0);
                if (total > 0) {
                    views.setViewVisibility(R.id.w_progress, View.VISIBLE);
                    views.setProgressBar(R.id.w_progress, 100, (int) Math.min(100, sent * 100 / total), false);
                }
            } else if (next != null) {
                views.setTextViewText(R.id.w_headline, "Next: " + numbered(next));
                String waiting = next.optString("waitingFor", "");
                String archive = next.optString("archive", "");
                views.setTextViewText(R.id.w_detail, waiting.isEmpty() ? archive
                        : archive.isEmpty() ? waiting : waiting + " · " + archive);
            } else {
                views.setTextViewText(R.id.w_headline, "Nothing waiting to upload");
                views.setTextViewText(R.id.w_detail, "New videos are queued as they arrive.");
            }

            JSONArray attention = snapshot.optJSONArray("attention");
            int count = attention == null ? 0 : attention.length();
            if (count > 0) {
                JSONObject first = attention.optJSONObject(0);
                views.setViewVisibility(R.id.w_attention, View.VISIBLE);
                views.setTextViewText(R.id.w_attention, count == 1 && first != null
                        ? "⚠ " + first.optString("title", "Needs your attention")
                        : "⚠ " + count + " things need your attention");
            }

            JSONObject quota = snapshot.optJSONObject("quota");
            String queueText = running ? "Queue running" : "Queue stopped";
            String quotaText = quota == null || quota.isNull("uploadsLeftToday") || !quota.has("uploadsLeftToday")
                    ? "" : " · " + quota.optInt("uploadsLeftToday", 0) + " left today";
            long statusAt = state.getLong("status_at", 0);
            String age = statusAt > 0 && now - statusAt > StatusSync.OFFLINE_AFTER_MS
                    ? " · as of " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(statusAt)) : "";
            views.setTextViewText(R.id.w_quota, errorOr(state, sending, queueText + quotaText + age));

            if (device.optBoolean("companion_control", false) && sending == null) {
                String kind = running ? "queue.pause" : "queue.resume";
                Intent toggle = new Intent(ACTION_TOGGLE)
                        .putExtra("kind", kind)
                        .putExtra("device", device.optString("id"));
                views.setViewVisibility(R.id.w_toggle, View.VISIBLE);
                views.setTextViewText(R.id.w_toggle, running ? "Stop" : "Start");
                views.setInt(R.id.w_toggle, "setBackgroundResource",
                        running ? R.drawable.button_secondary : R.drawable.button_primary);
                views.setOnClickPendingIntent(R.id.w_toggle, broadcast(context, 11, toggle));
            }
        } catch (JSONException e) {
            views.setTextViewText(R.id.w_headline, "Open Dragonfly");
            views.setTextViewText(R.id.w_detail, "");
        }
        return views;
    }

    private static String errorOr(SharedPreferences state, String sending, String text) {
        if (sending != null) return sending;
        String error = state.getString("error", null);
        return error != null ? error : text;
    }

    private static String numbered(JSONObject item) {
        int number = item.optInt("number", 0);
        String file = item.optString("file", "");
        if (number > 0) return "#" + number + (file.isEmpty() ? "" : " · " + file);
        return file.isEmpty() ? "video" : file;
    }
}
