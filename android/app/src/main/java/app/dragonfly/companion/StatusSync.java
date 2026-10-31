package app.dragonfly.companion;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.time.Instant;

/**
 * Fetches the chosen computer's status, keeps it for the widget, refreshes
 * the widget and raises notifications for anything new.
 */
final class StatusSync {
    static final long OFFLINE_AFTER_MS = 10 * 60 * 1000L;

    private StatusSync() {}

    /** Runs on a background thread. Never throws. */
    static void run(Context context, boolean notify) {
        SharedPreferences state = Store.state(context);
        try {
            if (!Store.signedIn(context)) {
                state.edit().putBoolean("signed_out", true).apply();
                return;
            }
            JSONArray devices = Api.select(context, "dragonfly_devices",
                    "select=id,name,platform,last_seen_at,companion_control&order=last_seen_at.desc");
            JSONObject device = pickDevice(devices, state.getString("device_id", null));
            SharedPreferences.Editor edit = state.edit()
                    .putBoolean("signed_out", false)
                    .putString("error", null)
                    .putLong("last_sync", System.currentTimeMillis());
            if (device == null) {
                edit.remove("device_json").remove("snapshot_json").apply();
                return;
            }
            JSONArray rows = Api.select(context, "dragonfly_device_status",
                    "select=snapshot,updated_at&device_id=eq." + Api.enc(device.getString("id")));
            JSONObject status = rows.length() > 0 ? rows.getJSONObject(0) : null;
            JSONObject snapshot = status == null ? null : status.optJSONObject("snapshot");
            edit.putString("device_json", device.toString());
            if (snapshot != null) {
                edit.putString("snapshot_json", snapshot.toString());
                edit.putLong("status_at", parseTime(status.optString("updated_at", "")));
            } else {
                edit.remove("snapshot_json");
            }
            edit.apply();
            if (snapshot != null) Notifier.onSnapshot(context, device, snapshot, notify);
        } catch (Api.NotSignedIn e) {
            state.edit().putBoolean("signed_out", true).apply();
        } catch (IOException | org.json.JSONException | RuntimeException e) {
            state.edit().putString("error", "Can't reach Dragonfly right now").apply();
        } finally {
            StatusWidget.renderAll(context);
            Updates.checkIfDue(context);
        }
    }

    private static JSONObject pickDevice(JSONArray devices, String wanted) throws org.json.JSONException {
        if (devices.length() == 0) return null;
        if (wanted != null) {
            for (int i = 0; i < devices.length(); i++) {
                JSONObject device = devices.getJSONObject(i);
                if (wanted.equals(device.optString("id"))) return device;
            }
        }
        return devices.getJSONObject(0); // most recently seen
    }

    static long parseTime(String value) {
        if (value == null || value.isEmpty()) return 0;
        try {
            return Instant.parse(value.replace(" ", "T").replaceAll("\\+00(:00)?$", "Z")).toEpochMilli();
        } catch (RuntimeException e) {
            try {
                return java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli();
            } catch (RuntimeException ignored) {
                return 0;
            }
        }
    }

    static boolean online(JSONObject device, long now) {
        long seen = parseTime(device.optString("last_seen_at", ""));
        return seen > 0 && now - seen < OFFLINE_AFTER_MS;
    }
}
