package app.dragonfly.companion;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * The few Supabase calls the widget and the background check need, made with
 * the same signed-in session as the web page. Row-level security limits every
 * call to the signed-in person's own computers.
 */
final class Api {
    static final String PROJECT_REF = "fkksaivdznqbfsfsagsj";
    static final String URL_BASE = "https://" + PROJECT_REF + ".supabase.co";
    // Public by design: the desktop app and the web page ship the same key.
    static final String ANON_KEY = "sb_publishable_ME6Xg1mtUBA4994aC0n6Uw_LKsJDTXu";
    private static final int TIMEOUT_MS = 15_000;
    /** Widget taps run inside a broadcast, which Android limits to a few seconds. */
    static final int QUICK_TIMEOUT_MS = 4_000;
    /** The page may still be finishing a refresh just after the app closes. */
    private static final long AFTER_PAUSE_MS = 60_000;
    private static final Object LOCK = new Object();

    static final class NotSignedIn extends Exception {
        NotSignedIn() {
            super("not signed in");
        }
    }

    private Api() {}

    /**
     * A valid access token. Refreshes the session when it is about to expire,
     * but never while the app is open: the page refreshes it then, and two
     * refreshes of one session could sign the person out.
     */
    static String accessToken(Context context) throws IOException, NotSignedIn {
        return accessToken(context, TIMEOUT_MS);
    }

    static String accessToken(Context context, int timeoutMs) throws IOException, NotSignedIn {
        synchronized (LOCK) {
            String raw = Store.sessionJson(context);
            if (raw == null) throw new NotSignedIn();
            try {
                JSONObject session = new JSONObject(raw);
                if (session.has("currentSession")) session = session.getJSONObject("currentSession");
                String access = session.optString("access_token", "");
                long expiresAt = session.optLong("expires_at", 0);
                long now = System.currentTimeMillis() / 1000;
                // Use the token while it is valid; refresh only when it has (nearly) expired,
                // and never while the page may refresh it, so one session is never refreshed twice.
                if (!access.isEmpty() && expiresAt > now + 10) return access;
                if (MainActivity.isVisible()
                        || System.currentTimeMillis() - MainActivity.pausedAt() < AFTER_PAUSE_MS) {
                    throw new IOException("session is being refreshed by the app");
                }
                String refresh = session.optString("refresh_token", "");
                if (refresh.isEmpty()) throw new NotSignedIn();
                JSONObject body = new JSONObject().put("refresh_token", refresh);
                Response response = send("POST", URL_BASE + "/auth/v1/token?grant_type=refresh_token", null, body.toString(), null, timeoutMs);
                if (response.code == 400 || response.code == 401) {
                    // The session was revoked or already replaced: sign in again in the app.
                    throw new NotSignedIn();
                }
                if (response.code != 200) throw new IOException("refresh failed: " + response.code);
                JSONObject next = new JSONObject(response.body);
                if (!next.has("expires_at") && next.has("expires_in")) {
                    next.put("expires_at", now + next.getLong("expires_in"));
                }
                Store.saveSessionJson(context, next.toString());
                return next.getString("access_token");
            } catch (JSONException e) {
                throw new NotSignedIn();
            }
        }
    }

    static String userId(Context context) {
        String raw = Store.sessionJson(context);
        if (raw == null) return null;
        try {
            JSONObject session = new JSONObject(raw);
            if (session.has("currentSession")) session = session.getJSONObject("currentSession");
            JSONObject user = session.optJSONObject("user");
            return user == null ? null : user.optString("id", null);
        } catch (JSONException e) {
            return null;
        }
    }

    static JSONArray select(Context context, String table, String query) throws IOException, NotSignedIn {
        String token = accessToken(context);
        Response response = send("GET", URL_BASE + "/rest/v1/" + table + "?" + query, token, null, null, TIMEOUT_MS);
        if (response.code == 401) throw new NotSignedIn();
        if (response.code != 200) throw new IOException(table + ": " + response.code);
        try {
            return new JSONArray(response.body);
        } catch (JSONException e) {
            throw new IOException("bad response");
        }
    }

    /** Queues one of the allowed commands for the computer; it checks everything itself. */
    static void sendCommand(Context context, String deviceId, String kind) throws IOException, NotSignedIn {
        String token = accessToken(context, QUICK_TIMEOUT_MS);
        String userId = userId(context);
        if (userId == null) throw new NotSignedIn();
        try {
            JSONObject row = new JSONObject()
                    .put("user_id", userId)
                    .put("device_id", deviceId)
                    .put("kind", kind)
                    .put("args", new JSONObject())
                    .put("status", "pending");
            Response response = send("POST", URL_BASE + "/rest/v1/dragonfly_device_commands", token, row.toString(),
                    "return=minimal", QUICK_TIMEOUT_MS);
            if (response.code == 401) throw new NotSignedIn();
            if (response.code != 201 && response.code != 204) {
                throw new IOException("command: " + response.code);
            }
        } catch (JSONException e) {
            throw new IOException("bad command");
        }
    }

    static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    static final class Response {
        final int code;
        final String body;

        Response(int code, String body) {
            this.code = code;
            this.body = body;
        }
    }

    static Response send(String method, String url, String token, String body, String prefer, int timeoutMs)
            throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(timeoutMs);
            connection.setReadTimeout(timeoutMs);
            if (url.startsWith(URL_BASE)) {
                connection.setRequestProperty("apikey", ANON_KEY);
                connection.setRequestProperty("Authorization", "Bearer " + (token != null ? token : ANON_KEY));
            }
            connection.setRequestProperty("Accept", "application/json");
            if (prefer != null) connection.setRequestProperty("Prefer", prefer);
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = connection.getResponseCode();
            InputStream in = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new Response(code, in == null ? "" : read(in));
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            int total = 0;
            while ((n = stream.read(buffer)) > 0) {
                total += n;
                if (total > 512 * 1024) throw new IOException("response too large");
                out.write(buffer, 0, n);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
