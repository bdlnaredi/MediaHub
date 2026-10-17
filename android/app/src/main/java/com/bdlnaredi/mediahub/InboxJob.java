// Checks the MediaHub server now and then for messages meant for you and shows them as phone notifications.
// Copyright (C) 2026 bdlnaredi, GPL-3.0-or-later. See the LICENSE file.
package com.bdlnaredi.mediahub;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class InboxJob extends JobService {
    static final int JOB_ID = 4201;
    static final String CHANNEL = "mediahub_messages";
    private volatile boolean stopped;

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, InboxJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }

    // Makes sure the check is scheduled while notifications are on (it can be lost after an update).
    static void keep(Context c, boolean on) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (on && js.getPendingJob(JOB_ID) == null) schedule(c);
    }

    static void cancel(Context c) {
        ((JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(JOB_ID);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        stopped = false;
        new Thread(() -> {
            boolean retry = false;
            try {
                check();
            } catch (Exception e) {
                retry = false; // the next scheduled run tries again
            }
            jobFinished(params, retry);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;
        return false;
    }

    private void check() throws Exception {
        SharedPreferences prefs = getSharedPreferences("mediahub", MODE_PRIVATE);
        String server = prefs.getString("server", null);
        if (server == null || !prefs.getBoolean("notify", false)) return;
        long last = prefs.getLong("inboxLast", 0);
        HttpURLConnection c = (HttpURLConnection) new URL(server + "/api/inbox" + (last > 0 ? "?after=" + last : "")).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Accept", "application/json");
        String cookie = CookieManager.getInstance().getCookie(server);
        if (cookie != null) c.setRequestProperty("Cookie", cookie);
        try {
            if (c.getResponseCode() != 200) return; // signed out or server away: try again next time
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 262144) out.write(buf, 0, n);
            in.close();
            JSONObject j = new JSONObject(out.toString("UTF-8"));
            JSONArray items = j.optJSONArray("items");
            long newest = last;
            if (last > 0 && items != null) {
                for (int i = 0; i < items.length() && !stopped; i++) {
                    JSONObject it = items.getJSONObject(i);
                    show(it.optString("title"), it.optString("body"), it.optLong("id"));
                    newest = Math.max(newest, it.optLong("id"));
                }
            }
            // First run only learns where the inbox is up to, so old messages are not shown all at once.
            if (last == 0) newest = j.optLong("last");
            if (newest > 0) prefs.edit().putLong("inboxLast", newest).apply();
        } finally {
            c.disconnect();
        }
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Messages from MediaHub", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    private void show(String title, String body, long id) {
        ensureChannel(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title).setContentText(body).setContentIntent(pi).setAutoCancel(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify((int) (id % Integer.MAX_VALUE), b.build());
    }
}
