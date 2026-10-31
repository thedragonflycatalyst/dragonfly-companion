/**
 * Status snapshot published by the desktop app (contract v1, 2026-10-31).
 * Parsing is deliberately forgiving: any field may be missing or malformed,
 * and a newer version is still shown as far as the known fields go.
 */
export const SNAPSHOT_VERSION = 1;

export type JobState = 'running' | 'paused' | 'held' | 'ended' | 'done' | 'unknown';

export interface NextUpload {
  archive: string;
  number: number | null;
  file: string;
  waitingFor: string;
}
export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
}
export interface ArchiveInfo {
  id: number | null;
  name: string;
  monitoring: boolean;
  lastScanAt: number | null;
  channel: string;
  playlist: string;
  upTo: number | null;
  unuploaded: number | null;
}
export interface HeldInfo {
  number: number | null;
  file: string;
  reason: string;
  /**
   * Set by the desktop only when its last "Check on YouTube" found the held
   * video NOT on YouTube, so resuming from it cannot duplicate an upload.
   * Not in the v1 contract table yet; absent means "not safe" (fail closed).
   */
  resumeAllowed: boolean;
}
export interface JobInfo {
  id: string;
  name: string;
  archive: string;
  uploaded: number;
  remaining: number;
  state: JobState;
  held: HeldInfo | null;
}
export interface RecentItem {
  at: number | null;
  text: string;
}
export interface Snapshot {
  version: number | null;
  /** True when the desktop speaks a newer format than this companion knows. */
  newerVersion: boolean;
  generatedAt: number | null;
  queue: { running: boolean | null; pausedReason: string | null; next: NextUpload | null };
  quota: { uploadsLeftToday: number | null; resetsAt: number | null };
  attention: AttentionItem[];
  archives: ArchiveInfo[];
  jobs: JobInfo[];
  recent: RecentItem[];
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : {});
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number => Math.max(0, Math.floor(num(value) ?? 0));
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const MAX_ITEMS = 200;

/** Epoch milliseconds; tolerates seconds (values too small to be ms). */
export function toMillis(value: unknown): number | null {
  const n = num(value);
  if (n === null || n <= 0) return null;
  return n < 1e11 ? n * 1000 : n;
}

const JOB_STATES: readonly JobState[] = ['running', 'paused', 'held', 'ended', 'done'];
function jobState(value: unknown): JobState {
  return JOB_STATES.find((state) => state === value) ?? 'unknown';
}

function parseHeld(value: unknown): HeldInfo | null {
  if (!isObj(value)) return null;
  return {
    number: num(value.number),
    file: str(value.file),
    reason: str(value.reason),
    resumeAllowed: value.resumeAllowed === true,
  };
}

function parseNext(value: unknown): NextUpload | null {
  if (!isObj(value)) return null;
  const next = {
    archive: str(value.archive),
    number: num(value.number),
    file: str(value.file),
    waitingFor: str(value.waitingFor),
  };
  return next.archive || next.file || next.number !== null || next.waitingFor ? next : null;
}

/** Returns null only when the value cannot be a snapshot at all. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isObj(value)) return null;
  const version = num(value.v);
  const queue = obj(value.queue);
  const quota = obj(value.quota);
  return {
    version,
    newerVersion: version !== null && version > SNAPSHOT_VERSION,
    generatedAt: toMillis(value.generatedAt),
    queue: {
      running: typeof queue.running === 'boolean' ? queue.running : null,
      pausedReason: str(queue.pausedReason) || null,
      next: parseNext(queue.next),
    },
    quota: {
      uploadsLeftToday: num(quota.uploadsLeftToday),
      resetsAt: toMillis(quota.resetsAt),
    },
    attention: list(value.attention)
      .slice(0, MAX_ITEMS)
      .filter(isObj)
      .map((item, index) => ({
        id: str(item.id) || String(index),
        title: str(item.title),
        detail: str(item.detail),
      }))
      .filter((item) => item.title || item.detail),
    archives: list(value.archives)
      .slice(0, MAX_ITEMS)
      .filter(isObj)
      .map((item) => ({
        id: num(item.id),
        name: str(item.name),
        monitoring: item.monitoring === true,
        lastScanAt: toMillis(item.lastScanAt),
        channel: str(item.channel),
        playlist: str(item.playlist),
        upTo: num(item.upTo),
        unuploaded: num(item.unuploaded),
      })),
    jobs: list(value.jobs)
      .slice(0, MAX_ITEMS)
      .filter(isObj)
      .map((item, index) => {
        const state = jobState(item.state);
        return {
          id: str(item.id) || `job-${index}`,
          name: str(item.name),
          archive: str(item.archive),
          uploaded: count(item.uploaded),
          remaining: count(item.remaining),
          state,
          held: parseHeld(item.held),
        };
      }),
    recent: list(value.recent)
      .slice(0, MAX_ITEMS)
      .filter(isObj)
      .map((item) => ({ at: toMillis(item.at), text: str(item.text) }))
      .filter((item) => item.text),
  };
}

/** Progress 0..1 for a job, or null when nothing is known. */
export function jobProgress(job: Pick<JobInfo, 'uploaded' | 'remaining'>): number | null {
  const total = job.uploaded + job.remaining;
  return total > 0 ? job.uploaded / total : null;
}
