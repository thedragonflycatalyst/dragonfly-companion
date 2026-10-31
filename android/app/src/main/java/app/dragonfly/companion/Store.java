package app.dragonfly.companion;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Private app storage. "session" holds what the web page stores through the
 * bridge (the Supabase sign-in session; never a password). "state" holds the
 * widget's last status and what has already been notified.
 */
final class Store {
    static final String SESSION_KEY = "sb-" + Api.PROJECT_REF + "-auth-token";

    private Store() {}

    static SharedPreferences session(Context context) {
        return context.getSharedPreferences("session", Context.MODE_PRIVATE);
    }

    static SharedPreferences state(Context context) {
        return context.getSharedPreferences("state", Context.MODE_PRIVATE);
    }

    static String sessionJson(Context context) {
        return session(context).getString(SESSION_KEY, null);
    }

    static void saveSessionJson(Context context, String json) {
        session(context).edit().putString(SESSION_KEY, json).commit();
    }

    static boolean signedIn(Context context) {
        return sessionJson(context) != null;
    }
}
