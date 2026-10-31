package app.dragonfly.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import org.json.JSONObject;

/**
 * Looks for a newer app on GitHub Releases at most twice a day and offers it
 * once per version. Installing stays the person's choice.
 */
final class Updates {
    static final String RELEASES =
            "https://api.github.com/repos/thedragonflycatalyst/dragonfly-companion/releases/latest";
    private static final long EVERY_MS = 12 * 60 * 60 * 1000L;
    private static final String PREFIX = "android-v";

    private Updates() {}

    static void checkIfDue(Context context) {
        SharedPreferences state = Store.state(context);
        long now = System.currentTimeMillis();
        if (now - state.getLong("update_checked", 0) < EVERY_MS) return;
        state.edit().putLong("update_checked", now).apply();
        try {
            Api.Response response = Api.send("GET", RELEASES, null, null, null, 15_000);
            if (response.code != 200) return;
            JSONObject release = new JSONObject(response.body);
            String tag = release.optString("tag_name", "");
            if (!tag.startsWith(PREFIX)) return;
            long latest = buildOf(tag.substring(PREFIX.length()));
            if (latest <= currentBuild(context)) return;
            if (tag.equals(state.getString("update_offered", ""))) return;
            state.edit().putString("update_offered", tag).apply();
            Notifier.show(context, Notifier.UPDATES, 9001, "Dragonfly update available",
                    "Version " + tag.substring(PREFIX.length()) + " is ready. Tap to download it.",
                    Notifier.openUrl(context, release.optString("html_url",
                            "https://github.com/thedragonflycatalyst/dragonfly-companion/releases/latest")));
        } catch (Exception ignored) {
            // Offline or rate-limited: try again later.
        }
    }

    /** "1.0.17" → 17 (the build number). */
    static long buildOf(String version) {
        String[] parts = version.split("\\.");
        try {
            return Long.parseLong(parts[parts.length - 1]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static long currentBuild(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.getLongVersionCode();
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE;
        }
    }
}
