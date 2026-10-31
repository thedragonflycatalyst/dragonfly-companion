import { describe, expect, it } from 'vitest';
import { jobProgress, parseSnapshot, toMillis } from '../src/lib/snapshot';
import { NOW, fullSnapshot } from './fixtures';

describe('parseSnapshot', () => {
  it('reads a complete v1 snapshot', () => {
    const snap = parseSnapshot(fullSnapshot);
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.version).toBe(1);
    expect(snap.newerVersion).toBe(false);
    expect(snap.queue.running).toBe(true);
    expect(snap.queue.next).toEqual({
      archive: 'Sample Archive',
      number: 42,
      file: '42 - sample clip.mp4',
      waitingFor: '',
    });
    expect(snap.quota.uploadsLeftToday).toBe(7);
    expect(snap.attention).toEqual([
      { id: 'a1', title: 'Made for kids not set', detail: 'Held until you choose.' },
    ]);
    expect(snap.archives[0]?.upTo).toBe(41);
    expect(snap.jobs[0]?.state).toBe('held');
    expect(snap.jobs[0]?.held?.number).toBe(42);
    expect(snap.jobs[0]?.held?.resumeAllowed).toBe(false);
    expect(snap.recent).toEqual([{ at: NOW - 60_000, text: 'Uploaded #41' }]);
  });

  it('reads the current upload and the last uploaded video (optional additions)', () => {
    const snap = parseSnapshot({
      ...fullSnapshot,
      queue: {
        ...fullSnapshot.queue,
        current: {
          archive: 'Sample Archive',
          number: 42,
          file: '42 - sample clip.mp4',
          phase: 'uploading',
          bytesSent: 25,
          totalBytes: 100,
        },
      },
      archives: [{ ...fullSnapshot.archives[0], lastVideoId: 'abcDEF_1234' }],
    });
    expect(snap?.queue.current).toEqual({
      archive: 'Sample Archive',
      number: 42,
      file: '42 - sample clip.mp4',
      phase: 'uploading',
      progress: 0.25,
    });
    expect(snap?.archives[0]?.lastVideoId).toBe('abcDEF_1234');
    // Anything that is not a YouTube id is dropped, never turned into a link.
    const bad = parseSnapshot({
      ...fullSnapshot,
      archives: [{ ...fullSnapshot.archives[0], lastVideoId: 'javascript:alert(1)' }],
    });
    expect(bad?.archives[0]?.lastVideoId).toBeNull();
    expect(parseSnapshot(fullSnapshot)?.queue.current).toBeNull();
  });

  it('tolerates an empty object and missing sections', () => {
    const snap = parseSnapshot({});
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.version).toBeNull();
    expect(snap.queue).toEqual({ running: null, pausedReason: null, next: null });
    expect(snap.quota).toEqual({ uploadsLeftToday: null, resetsAt: null });
    expect(snap.attention).toEqual([]);
    expect(snap.archives).toEqual([]);
    expect(snap.jobs).toEqual([]);
    expect(snap.recent).toEqual([]);
  });

  it('tolerates wrong types inside sections', () => {
    const snap = parseSnapshot({
      v: 1,
      queue: { running: 'yes', next: 'nope' },
      quota: { uploadsLeftToday: '5' },
      attention: 'x',
      archives: [null, 5, { name: 7, id: 'x', upTo: Number.NaN }],
      jobs: [{ uploaded: -4, remaining: 'two', state: 'exploded', held: [] }],
      recent: [{ text: '' }, { at: 'soon', text: 'ok' }],
    });
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.queue.running).toBeNull();
    expect(snap.queue.next).toBeNull();
    expect(snap.quota.uploadsLeftToday).toBeNull();
    expect(snap.attention).toEqual([]);
    expect(snap.archives).toHaveLength(1);
    expect(snap.archives[0]).toMatchObject({ id: null, name: '', upTo: null, monitoring: false });
    expect(snap.jobs[0]).toMatchObject({
      id: 'job-0',
      uploaded: 0,
      remaining: 0,
      state: 'unknown',
      held: null,
    });
    expect(snap.recent).toEqual([{ at: null, text: 'ok' }]);
  });

  it('shows a newer version as far as known fields go', () => {
    const snap = parseSnapshot({ ...fullSnapshot, v: 2, extra: { future: true } });
    expect(snap?.newerVersion).toBe(true);
    expect(snap?.queue.next?.number).toBe(42);
  });

  it('accepts a JSON string and rejects non-objects', () => {
    expect(parseSnapshot(JSON.stringify(fullSnapshot))?.version).toBe(1);
    expect(parseSnapshot('not json')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([1, 2])).toBeNull();
    expect(parseSnapshot(5)).toBeNull();
  });

  it('only marks resume as allowed when the desktop says so explicitly', () => {
    const job = {
      ...fullSnapshot.jobs[0],
      held: { number: 42, file: 'f', reason: 'r', resumeAllowed: 'true' },
    };
    expect(parseSnapshot({ ...fullSnapshot, jobs: [job] })?.jobs[0]?.held?.resumeAllowed).toBe(
      false,
    );
    const ok = { ...job, held: { ...job.held, resumeAllowed: true } };
    expect(parseSnapshot({ ...fullSnapshot, jobs: [ok] })?.jobs[0]?.held?.resumeAllowed).toBe(true);
  });

  it('caps very long lists', () => {
    const recent = Array.from({ length: 500 }, (_, i) => ({ at: NOW, text: `item ${i}` }));
    expect(parseSnapshot({ v: 1, recent })?.recent).toHaveLength(200);
  });
});

describe('toMillis and jobProgress', () => {
  it('treats small epoch values as seconds', () => {
    expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMillis(0)).toBeNull();
    expect(toMillis(-5)).toBeNull();
    expect(toMillis('1')).toBeNull();
  });
  it('computes progress and handles empty jobs', () => {
    expect(jobProgress({ uploaded: 3, remaining: 1 })).toBe(0.75);
    expect(jobProgress({ uploaded: 0, remaining: 0 })).toBeNull();
  });
});
