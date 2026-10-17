// MediaHub for Android: a small app that opens your own MediaHub server full screen.
// Copyright (C) 2026 bdlnaredi
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
// It is distributed WITHOUT ANY WARRANTY; see the LICENSE file.
package com.bdlnaredi.mediahub;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String ACTION_CHANGE_SERVER = "com.bdlnaredi.mediahub.CHANGE_SERVER";
    private static final int REQ_FILE = 77;
    private static final int REQ_NOTIFY = 78;
    private static final int REQ_STORAGE = 79;
    private static final int BG = Color.parseColor("#0e131d");
    private static final int ACCENT = Color.parseColor("#ffb23e");
    private static final int TEXT = Color.parseColor("#f1f0fa");
    private static final int MUTE = Color.parseColor("#9a98b8");

    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView web;
    private WebView popup;
    private LinearLayout setupView;
    private LinearLayout errorView;
    private EditText addressField;
    private Button connectButton;
    private Button cancelButton;
    private TextView setupMessage;
    private TextView errorText;
    private String server;
    private ValueCallback<Uri[]> filePick;
    private String lastExternal = "";
    private long lastExternalAt = 0;
    private String[] pendingDownload;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        prefs = getSharedPreferences("mediahub", MODE_PRIVATE);
        server = prefs.getString("server", null);

        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root);

        buildWeb();
        buildSetup();
        buildError();

        if (server == null || ACTION_CHANGE_SERVER.equals(getIntent().getAction())) {
            showSetup();
        } else {
            showWeb(true);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ACTION_CHANGE_SERVER.equals(intent.getAction())) showSetup();
    }

    // ---------------------------------------------------------------- the page

    private void buildWeb() {
        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " MediaHubApp/2");
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "MediaHubApp");
        web.setDownloadListener((url, userAgent, contentDisposition, mime, length) -> startDownload(url, userAgent, contentDisposition, mime));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return leavesServer(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError("MediaHub could not be reached at " + server + ".\n\nCheck that the server is on, and that this phone is on the same network or has a way in.");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError("The secure connection to " + server + " could not be verified.\n\nUse a certificate from a trusted authority, or connect with http:// on your home network.");
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePick != null) filePick.onReceiveValue(null);
                filePick = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    filePick = null;
                    return false;
                }
                return true;
            }

            // Links that open a new window (Sign in with Plex, links to IMDb and so on) go to the phone's own browser.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (popup != null) {
                    root.removeView(popup);
                    popup.destroy();
                }
                popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(true);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        openOutside(request.getUrl());
                        return true;
                    }

                    @Override
                    public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                        if (url != null && url.startsWith("http")) {
                            v.stopLoading();
                            openOutside(Uri.parse(url));
                        }
                    }
                });
                root.addView(popup, new FrameLayout.LayoutParams(1, 1));
                popup.setVisibility(View.INVISIBLE);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // True when the link leaves your server: it is then opened in the browser instead.
    private boolean leavesServer(Uri uri) {
        if (sameServer(uri)) return false;
        openOutside(uri);
        return true;
    }

    private boolean sameServer(Uri uri) {
        if (server == null || uri == null) return false;
        Uri base = Uri.parse(server);
        return eq(base.getScheme(), uri.getScheme()) && eq(base.getHost(), uri.getHost()) && portOf(base) == portOf(uri);
    }

    private static boolean eq(String a, String b) {
        return a != null && b != null && a.equalsIgnoreCase(b);
    }

    private static int portOf(Uri u) {
        if (u.getPort() != -1) return u.getPort();
        return "https".equalsIgnoreCase(u.getScheme()) ? 443 : 80;
    }

    private void openOutside(Uri uri) {
        String url = String.valueOf(uri);
        long now = System.currentTimeMillis();
        if (url.equals(lastExternal) && now - lastExternalAt < 2000) return;
        lastExternal = url;
        lastExternalAt = now;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https") && !scheme.equals("mailto") && !scheme.equals("tel")) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    // ---------------------------------------------------------------- downloads and notifications

    private boolean needsStoragePermission() {
        return Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED;
    }

    // Files from your own server go to the phone's Downloads folder, with the sign-in cookie so protected files work.
    private void startDownload(String url, String userAgent, String disposition, String mime) {
        Uri uri = Uri.parse(url);
        if (!sameServer(uri)) {
            openOutside(uri);
            return;
        }
        if (needsStoragePermission()) {
            pendingDownload = new String[]{url, userAgent, disposition, mime};
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, disposition, mime);
            DownloadManager.Request r = new DownloadManager.Request(uri);
            if (mime != null && !mime.isEmpty()) r.setMimeType(mime);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie);
            if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(this, "Downloading " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "The download could not start.", Toast.LENGTH_LONG).show();
        }
    }

    private void toastLater(final String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    private void tellPage() {
        runOnUiThread(() -> web.evaluateJavascript("window.mhNotifyChanged&&window.mhNotifyChanged()", null));
    }

    private void enableNotifications() {
        prefs.edit().putBoolean("notify", true).putLong("inboxLast", 0).apply();
        InboxJob.ensureChannel(this);
        InboxJob.schedule(this);
        // Learn where the inbox is now, so only newer messages become notifications.
        web.evaluateJavascript("fetch('/api/inbox').then(function(r){return r.json()}).then(function(j){MediaHubApp.setLast(String(j.last))})", null);
        tellPage();
    }

    // What the MediaHub page can ask of the app (only the page of your own server can reach this).
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safe = name == null ? "mediahub-file" : name.replaceAll("[^A-Za-z0-9._-]", "_");
                if (safe.isEmpty()) safe = "mediahub-file";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (item == null) throw new Exception("no file");
                    try (OutputStream o = getContentResolver().openOutputStream(item)) {
                        o.write(data);
                    }
                } else {
                    if (needsStoragePermission()) {
                        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE));
                        toastLater("Allow storage access, then save the file again.");
                        return;
                    }
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    dir.mkdirs();
                    try (FileOutputStream o = new FileOutputStream(new File(dir, safe))) {
                        o.write(data);
                    }
                }
                toastLater("Saved " + safe + " in Downloads");
            } catch (Exception e) {
                toastLater("The file could not be saved.");
            }
        }

        @JavascriptInterface
        public String notifyState() {
            if (!prefs.getBoolean("notify", false)) return "off";
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "denied";
            return "on";
        }

        @JavascriptInterface
        public void setNotify(final boolean on) {
            runOnUiThread(() -> {
                if (!on) {
                    prefs.edit().putBoolean("notify", false).apply();
                    InboxJob.cancel(MainActivity.this);
                    tellPage();
                } else if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                } else {
                    enableNotifications();
                }
            });
        }

        @JavascriptInterface
        public void setLast(String value) {
            try {
                prefs.edit().putLong("inboxLast", Long.parseLong(value)).apply();
            } catch (NumberFormatException ignored) {
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (request == REQ_NOTIFY) {
            if (granted) enableNotifications();
            else tellPage();
        } else if (request == REQ_STORAGE) {
            if (granted && pendingDownload != null) startDownload(pendingDownload[0], pendingDownload[1], pendingDownload[2], pendingDownload[3]);
            pendingDownload = null;
        } else {
            super.onRequestPermissionsResult(request, permissions, results);
        }
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush(); // so the background check can use the sign-in
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        InboxJob.keep(this, prefs.getBoolean("notify", false));
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == REQ_FILE) {
            Uri[] picked = null;
            if (result == RESULT_OK && data != null) picked = WebChromeClient.FileChooserParams.parseResult(result, data);
            if (filePick != null) filePick.onReceiveValue(picked);
            filePick = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    // ---------------------------------------------------------------- the screens

    private void showWeb(boolean reload) {
        setupView.setVisibility(View.GONE);
        errorView.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        if (reload || web.getUrl() == null) web.loadUrl(server);
    }

    private void showSetup() {
        errorView.setVisibility(View.GONE);
        web.setVisibility(View.GONE);
        setupView.setVisibility(View.VISIBLE);
        addressField.setText(server == null ? "" : server);
        setupMessage.setText("");
        connectButton.setEnabled(true);
        cancelButton.setVisibility(server == null ? View.GONE : View.VISIBLE);
    }

    private void showError(String message) {
        errorText.setText(message);
        web.setVisibility(View.GONE);
        setupView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    private void buildSetup() {
        setupView = column();
        setupView.addView(label("MediaHub", 32, TEXT, true));
        setupView.addView(label("Type the address of your MediaHub server, for example 192.168.1.10:5080 or https://media.example.com", 15, MUTE, false), spaced(8, 0));

        addressField = new EditText(this);
        addressField.setSingleLine(true);
        addressField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addressField.setImeOptions(EditorInfo.IME_ACTION_GO);
        addressField.setHint("Server address");
        addressField.setTextColor(TEXT);
        addressField.setHintTextColor(MUTE);
        addressField.setPadding(dp(16), dp(12), dp(16), dp(12));
        addressField.setBackground(rounded(Color.parseColor("#1b2230"), 14));
        addressField.setOnEditorActionListener((v, action, event) -> {
            connect();
            return true;
        });
        setupView.addView(addressField, spaced(20, 0));

        connectButton = button("Connect", true);
        connectButton.setOnClickListener(v -> connect());
        setupView.addView(connectButton, spaced(14, 0));

        cancelButton = button("Cancel", false);
        cancelButton.setOnClickListener(v -> showWeb(false));
        setupView.addView(cancelButton, spaced(8, 0));

        setupMessage = label("", 14, Color.parseColor("#ff7a8a"), false);
        setupView.addView(setupMessage, spaced(12, 0));
        root.addView(setupView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void buildError() {
        errorView = column();
        errorView.addView(label("Cannot reach MediaHub", 24, TEXT, true));
        errorText = label("", 15, MUTE, false);
        errorView.addView(errorText, spaced(10, 0));
        Button retry = button("Try again", true);
        retry.setOnClickListener(v -> showWeb(true));
        errorView.addView(retry, spaced(20, 0));
        Button change = button("Change server", false);
        change.setOnClickListener(v -> showSetup());
        errorView.addView(change, spaced(8, 0));
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // Checks that the address really is a MediaHub server, then remembers it.
    private void connect() {
        final String base = normalise(addressField.getText().toString());
        if (base == null) {
            setupMessage.setText("That does not look like an address. Try something like 192.168.1.10:5080");
            return;
        }
        connectButton.setEnabled(false);
        setupMessage.setTextColor(MUTE);
        setupMessage.setText("Checking " + base + " ...");
        new Thread(() -> {
            String problem = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/me").openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                c.setRequestProperty("Accept", "application/json");
                if (c.getResponseCode() != 200) {
                    problem = "Something answered at that address, but it is not MediaHub.";
                } else {
                    InputStream in = c.getInputStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0 && out.size() < 65536) out.write(buf, 0, n);
                    in.close();
                    if (!out.toString("UTF-8").contains("\"version\"")) problem = "Something answered at that address, but it is not MediaHub.";
                }
                c.disconnect();
            } catch (javax.net.ssl.SSLException e) {
                problem = "The secure connection could not be verified. Use a certificate from a trusted authority, or http:// on your home network.";
            } catch (Exception e) {
                problem = "Could not reach that address. Check it, that the server is on, and that this phone can reach it.";
            }
            final String fail = problem;
            runOnUiThread(() -> {
                connectButton.setEnabled(true);
                if (fail != null) {
                    setupMessage.setTextColor(Color.parseColor("#ff7a8a"));
                    setupMessage.setText(fail);
                    return;
                }
                server = base;
                prefs.edit().putString("server", base).apply();
                showWeb(true);
            });
        }).start();
    }

    // "192.168.1.10:5080" becomes "http://192.168.1.10:5080". Anything after the address is dropped.
    static String normalise(String input) {
        String t = input == null ? "" : input.trim();
        if (t.isEmpty()) return null;
        if (!t.toLowerCase(Locale.ROOT).startsWith("http://") && !t.toLowerCase(Locale.ROOT).startsWith("https://")) t = "http://" + t;
        Uri u = Uri.parse(t);
        if (u.getHost() == null || u.getHost().isEmpty()) return null;
        return u.getScheme().toLowerCase(Locale.ROOT) + "://" + u.getAuthority();
    }

    @Override
    public void onBackPressed() {
        if (setupView.getVisibility() == View.VISIBLE && server != null) {
            showWeb(false);
        } else if (web.getVisibility() == View.VISIBLE && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (popup != null) popup.destroy();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- small helpers

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        l.setPadding(dp(28), dp(28), dp(28), dp(28));
        l.setBackgroundColor(BG);
        return l;
    }

    private TextView label(String text, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTextColor(primary ? Color.parseColor("#1a1206") : TEXT);
        b.setBackground(rounded(primary ? ACCENT : Color.parseColor("#1b2230"), 14));
        return b;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private LinearLayout.LayoutParams spaced(int topDp, int bottomDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.topMargin = dp(topDp);
        p.bottomMargin = dp(bottomDp);
        return p;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
