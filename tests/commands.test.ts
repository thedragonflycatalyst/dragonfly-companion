import { describe, expect, it } from 'vitest';
import {
  COMMAND_KINDS,
  availableActions,
  isExpired,
  isFinal,
  parseCommandRow,
  statusText,
} from '../src/lib/commands';
import { parseSnapshot } from '../src/lib/snapshot';
import { NOW, fullSnapshot } from './fixtures';

const snap = (overrides: Record<string, unknown> = {}) =>
  parseSnapshot({ ...fullSnapshot, ...overrides });
const kinds = (control: boolean, overrides: Record<string, unknown> = {}) =>
  availableActions(snap(overrides), control).map((action) => action.kind);

describe('command gating', () => {
  it('offers nothing when phone control is off', () => {
    expect(availableActions(snap(), false)).toEqual([]);
  });
  it('offers nothing without a snapshot', () => {
    expect(availableActions(null, true)).toEqual([]);
  });
  it('only ever offers allowed kinds', () => {
    for (const action of availableActions(snap(), true))
      expect(COMMAND_KINDS).toContain(action.kind);
  });
  it('offers pause while running and resume while paused', () => {
    expect(kinds(true)).toContain('queue.pause');
    expect(kinds(true)).not.toContain('queue.resume');
    const paused = kinds(true, { queue: { running: false, pausedReason: 'You paused it' } });
    expect(paused).toContain('queue.resume');
    expect(paused).not.toContain('queue.pause');
  });
  it('offers both when the queue state is unknown', () => {
    const unknown = kinds(true, { queue: {} });
    expect(unknown).toContain('queue.pause');
    expect(unknown).toContain('queue.resume');
  });
  it('confirms resume actions only', () => {
    const actions = availableActions(snap({ queue: { running: false } }), true);
    expect(actions.find((a) => a.kind === 'queue.resume')?.confirm).toBeTruthy();
    expect(actions.find((a) => a.kind === 'job.checkHold')?.confirm).toBeNull();
    expect(actions.find((a) => a.kind === 'monitor.scanNow')?.confirm).toBeNull();
  });
  it('offers a held check with the job id, but not resume-from-held by default', () => {
    const actions = availableActions(snap(), true);
    expect(actions.find((a) => a.kind === 'job.checkHold')?.args).toEqual({ jobId: 'job-1' });
    expect(actions.some((a) => a.kind === 'job.resumeFromHeld')).toBe(false);
  });
  it('offers resume from #N only when the desktop marks it safe', () => {
    const job = {
      ...fullSnapshot.jobs[0],
      held: { ...fullSnapshot.jobs[0]?.held, resumeAllowed: true },
    };
    const actions = availableActions(snap({ jobs: [job] }), true);
    const resume = actions.find((a) => a.kind === 'job.resumeFromHeld');
    expect(resume?.label).toContain('#42');
    expect(resume?.args).toEqual({ jobId: 'job-1' });
    expect(resume?.confirm).toContain('#42');
  });
  it('does not offer held actions for jobs that are not held', () => {
    const job = {
      ...fullSnapshot.jobs[0],
      state: 'running',
      held: { number: 42, resumeAllowed: true },
    };
    expect(kinds(true, { jobs: [job] }).filter((k) => k.startsWith('job.'))).toEqual([]);
  });
  it('does not offer resume when the held number is unknown', () => {
    const job = { ...fullSnapshot.jobs[0], held: { resumeAllowed: true } };
    expect(kinds(true, { jobs: [job] })).not.toContain('job.resumeFromHeld');
  });
  it('offers a scan per archive with a numeric id', () => {
    const archives = [fullSnapshot.archives[0], { name: 'No id' }];
    const scans = availableActions(snap({ archives }), true).filter(
      (a) => a.kind === 'monitor.scanNow',
    );
    expect(scans.map((a) => a.args)).toEqual([{ archiveId: 3 }]);
  });
});

describe('command status', () => {
  const created = new Date(NOW - 60_000).toISOString();
  it('knows final states', () => {
    expect(isFinal('pending')).toBe(false);
    expect(isFinal('accepted')).toBe(false);
    expect(isFinal('done')).toBe(true);
    expect(isFinal('rejected')).toBe(true);
    expect(isFinal('failed')).toBe(true);
  });
  it('expires pending commands after 10 minutes', () => {
    const old = new Date(NOW - 11 * 60_000).toISOString();
    expect(isExpired({ status: 'pending', created_at: created }, NOW)).toBe(false);
    expect(isExpired({ status: 'pending', created_at: old }, NOW)).toBe(true);
    expect(isExpired({ status: 'accepted', created_at: old }, NOW)).toBe(false);
    expect(statusText({ status: 'pending', created_at: old }, NOW)).toMatch(/Expired/);
    expect(statusText({ status: 'accepted', created_at: created }, NOW)).toMatch(/working/);
  });
  it('parses rows and rejects unknown statuses', () => {
    const row = parseCommandRow({
      id: 'c1',
      kind: 'queue.pause',
      args: null,
      status: 'done',
      created_at: created,
    });
    expect(row).toMatchObject({ id: 'c1', args: {}, status: 'done', result_message: null });
    expect(parseCommandRow({ id: 'c1', kind: 'queue.pause', status: 'weird' })).toBeNull();
    expect(parseCommandRow(null)).toBeNull();
  });
  it('explains Resume when nothing is waiting', () => {
    const empty = availableActions(snap({ queue: { running: false, next: null } }), true);
    expect(empty.find((a) => a.kind === 'queue.resume')?.description).toMatch(/Nothing is waiting/);
  });
});
