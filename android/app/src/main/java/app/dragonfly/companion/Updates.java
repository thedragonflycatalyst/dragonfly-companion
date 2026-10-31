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

    /** On opening the app: check more often, and the app shows its own prompt. */
    static final long ON_OPEN_MS = 30 * 60 * 1000L;

    /** An available update: its version and the page to download it from. */
    static final class Available {
        final String version;
        final String url;

        Available(String version, String url) {
            this.version = version;
            this.url = url;
        }
    }

    /** Background check (twice a day): a notification, once per version. */
    static void checkIfDue(Context context) {
        Available update = check(context, EVERY_MS);
        if (update == null) return;
        SharedPreferences state = Store.state(context);
        String tag = PREFIX + update.version;
        if (tag.equals(state.getString("update_offered", ""))) return;
        state.edit().putString("update_offered", tag).apply();
        Notifier.show(context, Notifier.UPDATES, 9001, "Dragonfly Uploader update available",
                "Version " + update.version + " is ready. Tap to download it.",
                Notifier.openUrl(context, update.url));
    }

    /**
     * The newest release when it is newer than this app, or null (also when
     * checked less than {@code minIntervalMs} ago, offline or rate-limited).
     */
    static Available check(Context context, long minIntervalMs) {
        SharedPreferences state = Store.state(context);
        long now = System.currentTimeMillis();
        if (now - state.getLong("update_checked", 0) < minIntervalMs) return null;
        state.edit().putLong("update_checked", now).apply();
        try {
            Api.Response response = Api.send("GET", RELEASES, null, null, null, 15_000);
            if (response.code != 200) return null;
            JSONObject release = new JSONObject(response.body);
            String tag = release.optString("tag_name", "");
            if (!tag.startsWith(PREFIX)) return null;
            String version = tag.substring(PREFIX.length());
            if (buildOf(version) <= currentBuild(context)) return null;
            String apk = null;
            org.json.JSONArray assets = release.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    String url = asset == null ? "" : asset.optString("browser_download_url", "");
                    if (url.startsWith("https://github.com/thedragonflycatalyst/dragonfly-companion/releases/download/")
                            && url.endsWith(".apk")) {
                        apk = url;
                    }
                }
            }
            return new Available(version, apk != null ? apk : release.optString("html_url",
                    "https://github.com/thedragonflycatalyst/dragonfly-companion/releases/latest"));
        } catch (Exception ignored) {
            return null; // Offline or rate-limited: try again later.
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
