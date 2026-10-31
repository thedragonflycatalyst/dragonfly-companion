package app.dragonfly.companion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The app window: the Dragonfly Companion page in a WebView, with a small
 * bridge so the page keeps its sign-in in the app's private storage (shared
 * with the widget). Only the companion page is ever loaded here; every other
 * link opens in the phone's browser.
 */
public class MainActivity extends Activity {
    static final String HOST = "thedragonflycatalyst.github.io";
    static final String PATH = "/dragonfly-companion/";
    static final String START_URL = "https://" + HOST + PATH;

    private static volatile boolean visible;
    private static volatile long pausedAt;
    private WebView web;
    private volatile boolean trusted;

    static boolean isVisible() {
        return visible;
    }

    static long pausedAt() {
        return pausedAt;
    }

    static boolean isCompanion(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith(PATH);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Notifier.createChannels(this);
        SyncJob.schedule(this);

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.surface));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " DragonflyAndroid/" + Updates.currentBuild(this));
        web.addJavascriptInterface(new Bridge(), "DragonflyNative");
        web.setWebViewClient(new Client());
        setContentView(web);

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        visible = false;
        pausedAt = System.currentTimeMillis();
        web.onPause();
        web.pauseTimers();
        SyncJob.soon(this, 2_000); // the widget picks up any sign-in or change
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        visible = false;
        web.destroy();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (RuntimeException ignored) {
            // No app can open it.
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isCompanion(uri)) return false;
            openOutside(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            trusted = isCompanion(Uri.parse(url));
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            trusted = false;
            view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
        }
    }

    private static final String OFFLINE_PAGE = "<!doctype html><meta name=viewport content='width=device-width'>"
            + "<body style='background:#14121F;color:#F2F0FA;font-family:sans-serif;padding:32px'>"
            + "<h2>Can't reach Dragonfly</h2><p style='color:#A9A3C2'>Check your connection, then try again.</p>"
            + "<p><a style='color:#fff;background:#7C5CFF;padding:12px 20px;border-radius:12px;text-decoration:none;display:inline-block'"
            + " href='" + START_URL + "'>Try again</a></p></body>";

    /** Called by the page (on a background thread). Answers only the companion page. */
    private final class Bridge {
        @JavascriptInterface
        public String getItem(String key) {
            if (!trusted || key == null) return null;
            return Store.session(MainActivity.this).getString(key, null);
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            if (!trusted || key == null) return;
            Store.session(MainActivity.this).edit().putString(key, value).commit();
            Store.state(MainActivity.this).edit().putBoolean("signed_out", false).apply();
        }

        @JavascriptInterface
        public void removeItem(String key) {
            if (!trusted || key == null) return;
            Store.session(MainActivity.this).edit().remove(key).commit();
            if (Store.SESSION_KEY.equals(key)) {
                Store.state(MainActivity.this).edit().clear().apply();
                StatusWidget.renderAll(MainActivity.this);
            }
        }

        @JavascriptInterface
        public void setDevice(String id) {
            if (!trusted) return;
            Store.state(MainActivity.this).edit().putString("device_id", id == null || id.isEmpty() ? null : id).apply();
            SyncJob.soon(MainActivity.this, 1_000);
        }

        @JavascriptInterface
        public void statusChanged() {
            if (!trusted) return;
            SyncJob.soon(MainActivity.this, 4_000);
        }
    }
}
