package app.dragonfly.companion;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Background check: every 15 minutes (Android's minimum) while online, plus
 * one-off checks a few seconds after the widget or the app sends a command.
 */
public class SyncJob extends JobService {
    private static final int PERIODIC_ID = 1;
    private static final int SOON_ID = 2;

    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler.getPendingJob(PERIODIC_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(PERIODIC_ID, new ComponentName(context, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build());
    }

    /** A quick refresh after a command, so the widget shows the result. */
    static void soon(Context context, long delayMs) {
        context.getSystemService(JobScheduler.class).schedule(
                new JobInfo.Builder(SOON_ID, new ComponentName(context, SyncJob.class))
                        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                        .setMinimumLatency(delayMs)
                        .setOverrideDeadline(delayMs + 30_000)
                        .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            StatusSync.run(getApplicationContext(), true);
            jobFinished(params, false);
        }, "dragonfly-sync").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
