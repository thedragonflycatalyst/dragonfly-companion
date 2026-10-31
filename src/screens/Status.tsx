import type { JobInfo, Snapshot } from '../lib/snapshot';
import { jobProgress } from '../lib/snapshot';
import { clockTime, isStale, relativeTime } from '../lib/time';

interface Props {
  snapshot: Snapshot | null;
  /** When the status row was last written (server time), or null. */
  updatedAt: number | null;
  loaded: boolean;
  now: number;
}

const STATE_LABEL: Record<JobInfo['state'], string> = {
  running: 'Uploading',
  paused: 'Paused',
  held: 'Held',
  ended: 'Ended',
  done: 'Done',
  unknown: 'Unknown',
};

export function StatusView({ snapshot, updatedAt, loaded, now }: Props) {
  if (!loaded)
    return (
      <p className="muted" aria-busy="true">
        Loading status…
      </p>
    );
  if (snapshot === null) {
    return (
      <div className="card empty">
        <h2>No status yet</h2>
        <p>
          On your computer, open Dragonfly Uploader → Accounts → Phone companion and turn on{' '}
          <strong>Share status with my phone</strong>.
        </p>
      </div>
    );
  }
  const lastUpdate = updatedAt ?? snapshot.generatedAt;
  const stale = isStale(lastUpdate, now);
  const next = snapshot.queue.next;
  const quota = snapshot.quota;

  return (
    <div className="stack">
      <p
        className={stale ? 'updated stale' : 'updated muted small'}
        role={stale ? 'status' : undefined}
      >
        {stale
          ? `Not updated for a while (last ${relativeTime(lastUpdate, now)}). Your computer may be off, asleep or offline.`
          : `Updated ${relativeTime(lastUpdate, now)}`}
      </p>
      {snapshot.newerVersion && (
        <p className="notice" role="note">
          Your computer has a newer Dragonfly Uploader. Some details may not show here until this
          page updates.
        </p>
      )}

      <section className="card hero" aria-labelledby="next-title">
        <h2 id="next-title" className="eyebrow">
          Next upload
        </h2>
        {next ? (
          <>
            <p className="hero-number">{next.number === null ? '—' : `#${next.number}`}</p>
            {next.file && <p className="hero-file">{next.file}</p>}
            {next.archive && <p className="muted">{next.archive}</p>}
            {next.waitingFor && <p className="waiting">Waiting for: {next.waitingFor}</p>}
          </>
        ) : (
          <p className="muted">Nothing waiting to upload.</p>
        )}
        <p className="queue-state">
          Queue:{' '}
          {snapshot.queue.running === true
            ? 'running'
            : snapshot.queue.running === false
              ? `paused${snapshot.queue.pausedReason ? ` (${snapshot.queue.pausedReason})` : ''}`
              : 'unknown'}
        </p>
      </section>

      <section className="card quota" aria-labelledby="quota-title">
        <h2 id="quota-title" className="eyebrow">
          Uploads left today
        </h2>
        <p className="quota-number">{quota.uploadsLeftToday ?? '—'}</p>
        {quota.resetsAt !== null && (
          <p className="muted small">Resets at {clockTime(quota.resetsAt)}</p>
        )}
      </section>

      {snapshot.attention.length > 0 && (
        <section className="card attention" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs your attention</h2>
          <ul>
            {snapshot.attention.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                {item.detail && <span className="muted"> {item.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="jobs-title">
        <h2 id="jobs-title" className="section-title">
          Jobs
        </h2>
        {snapshot.jobs.length === 0 ? (
          <p className="muted">No upload jobs.</p>
        ) : (
          <ul className="cards">
            {snapshot.jobs.map((job) => {
              const progress = jobProgress(job);
              const total = job.uploaded + job.remaining;
              return (
                <li key={job.id} className={`card job state-${job.state}`}>
                  <div className="row">
                    <strong>{job.name || job.archive || 'Upload job'}</strong>
                    <span className={`pill state-${job.state}`}>{STATE_LABEL[job.state]}</span>
                  </div>
                  {job.archive && job.name && <p className="muted small">{job.archive}</p>}
                  {progress !== null && (
                    <>
                      <progress
                        value={job.uploaded}
                        max={total}
                        aria-label={`${job.name || 'Job'} progress`}
                      />
                      <p className="small muted">
                        {job.uploaded} of {total} uploaded · {job.remaining} left
                      </p>
                    </>
                  )}
                  {job.held && (
                    <p className="held">
                      Held at {job.held.number === null ? 'a video' : `#${job.held.number}`}
                      {job.held.file ? ` (${job.held.file})` : ''}
                      {job.held.reason ? `: ${job.held.reason}` : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="archives-title">
        <h2 id="archives-title" className="section-title">
          Archives
        </h2>
        {snapshot.archives.length === 0 ? (
          <p className="muted">No archives.</p>
        ) : (
          <ul className="cards">
            {snapshot.archives.map((archive, index) => (
              <li key={archive.id ?? `a-${index}`} className="card">
                <div className="row">
                  <strong>{archive.name || 'Archive'}</strong>
                  <span className={archive.monitoring ? 'pill ok' : 'pill off'}>
                    {archive.monitoring ? 'Monitoring' : 'Not monitoring'}
                  </span>
                </div>
                <dl className="facts">
                  {archive.channel && (
                    <>
                      <dt>Channel</dt>
                      <dd>{archive.channel}</dd>
                    </>
                  )}
                  {archive.playlist && (
                    <>
                      <dt>Playlist</dt>
                      <dd>{archive.playlist}</dd>
                    </>
                  )}
                  {archive.upTo !== null && (
                    <>
                      <dt>Up to</dt>
                      <dd>#{archive.upTo}</dd>
                    </>
                  )}
                  {archive.unuploaded !== null && (
                    <>
                      <dt>Not uploaded yet</dt>
                      <dd>{archive.unuploaded}</dd>
                    </>
                  )}
                  {archive.lastScanAt !== null && (
                    <>
                      <dt>Last scan</dt>
                      <dd>{relativeTime(archive.lastScanAt, now)}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-title">
        <h2 id="recent-title" className="section-title">
          Recent activity
        </h2>
        {snapshot.recent.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ol className="recent">
            {snapshot.recent.map((item, index) => (
              <li key={`${item.at ?? 0}-${index}`}>
                <span>{item.text}</span>
                {item.at !== null && (
                  <time className="muted small">{relativeTime(item.at, now)}</time>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
