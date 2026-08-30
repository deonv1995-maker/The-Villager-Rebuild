package io.github.deonv1995maker.thevillager.test;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String TRUSTED_HOST = "deonv1995-maker.github.io";
    private static final String TRUSTED_PATH = "/The-Villager-Rebuild/";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        createGameWebView();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createGameWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 29, 21));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setOffscreenPreRaster(true);
        settings.setUserAgentString(
            settings.getUserAgentString() + " TheVillagerAndroidTest/" + BuildConfig.VERSION_NAME
        );

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri target = request.getUrl();
                if (isTrustedGameUrl(target)) return false;
                openExternal(target);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showNetworkError(error.getDescription() == null ? "The live game could not be reached." : error.getDescription().toString());
                }
            }
        });

        setContentView(webView);
        webView.loadUrl(BuildConfig.GAME_URL);
    }

    private boolean isTrustedGameUrl(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath();
        return "/The-Villager-Rebuild".equals(path) || (path != null && path.startsWith(TRUSTED_PATH));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            showNetworkError("No application is available to open that link.");
        }
    }

    private void showNetworkError(String detail) {
        if (webView == null) return;
        String safeDetail = TextUtils.htmlEncode(detail);
        String safeUrl = TextUtils.htmlEncode(BuildConfig.GAME_URL);
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<style>html,body{margin:0;height:100%;background:#101d15;color:#fff;font-family:sans-serif}" +
            "body{display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;box-sizing:border-box}" +
            "a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:10px;background:#8a7048;color:#fff;text-decoration:none;font-weight:700}</style>" +
            "</head><body><main><h2>The Villager needs a connection</h2><p>" + safeDetail + "</p>" +
            "<a href='" + safeUrl + "'>Retry</a></main></body></html>";
        webView.loadDataWithBaseURL(BuildConfig.GAME_URL, html, "text/html", "UTF-8", null);
    }

    private void configureWindow() {
        getWindow().setStatusBarColor(Color.rgb(16, 29, 21));
        getWindow().setNavigationBarColor(Color.rgb(16, 29, 21));
        applyImmersiveMode();
    }

    @SuppressWarnings("deprecation")
    private void applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyImmersiveMode();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
