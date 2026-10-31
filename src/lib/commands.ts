import type { Snapshot } from './snapshot';
import { COMMAND_EXPIRY_MS } from './time';

/** The only command kinds the phone may send (contract v1). */
export type CommandKind =
  | 'queue.pause'
  | 'queue.resume'
  | 'job.checkHold'
  | 'job.resumeFromHeld'
  | 'monitor.scanNow';

export const COMMAND_KINDS: readonly CommandKind[] = [
  'queue.pause',
  'queue.resume',
  'job.checkHold',
  'job.resumeFromHeld',
  'monitor.scanNow',
];

export type CommandStatus = 'pending' | 'accepted' | 'done' | 'rejected' | 'failed';
export const COMMAND_STATUSES: readonly CommandStatus[] = [
  'pending',
  'accepted',
  'done',
  'rejected',
  'failed',
];

export interface CommandRow {
  id: string;
  kind: string;
  args: Record<string, unknown>;
  status: CommandStatus;
  result_message: string | null;
  created_at: string;
  handled_at: string | null;
}

export interface CommandAction {
  /** Stable key for React and tests. */
  key: string;
  kind: CommandKind;
  args: Record<string, unknown>;
  label: string;
  /** Resume actions are confirmed first. */
  confirm: string | null;
  description: string;
}

/**
 * Which commands to offer for this snapshot. Phone control must be on; resume
 * from a held video is offered only when the desktop says it is safe.
 */
export function availableActions(snapshot: Snapshot | null, control: boolean): CommandAction[] {
  if (!control || snapshot === null) return [];
  const actions: CommandAction[] = [];
  const running = snapshot.queue.running;
  if (running !== false) {
    actions.push({
      key: 'queue.pause',
      kind: 'queue.pause',
      args: {},
      label: 'Pause queue',
      confirm: null,
      description: 'Stops after the current step. Nothing is skipped.',
    });
  }
  if (running !== true) {
    actions.push({
      key: 'queue.resume',
      kind: 'queue.resume',
      args: {},
      label: 'Resume queue',
      confirm:
        'Resume the upload queue on your computer? It continues in order, with all the usual checks.',
      description:
        snapshot.queue.next === null
          ? 'Nothing is waiting right now. Turning it on lets new videos upload in order as they arrive.'
          : 'Starts uploading again in order.',
    });
  }
  for (const job of snapshot.jobs) {
    if (job.state !== 'held' || job.held === null || !job.id) continue;
    const held = job.held;
    const name = job.name || job.archive || 'this job';
    const at = held.number === null ? 'the held video' : `#${held.number}`;
    actions.push({
      key: `job.checkHold:${job.id}`,
      kind: 'job.checkHold',
      args: { jobId: job.id },
      label: `Check held video on YouTube (${name})`,
      confirm: null,
      description: `Asks your computer to check whether ${at} is already on YouTube.`,
    });
    if (held.resumeAllowed && held.number !== null) {
      actions.push({
        key: `job.resumeFromHeld:${job.id}`,
        kind: 'job.resumeFromHeld',
        args: { jobId: job.id },
        label: `Resume from #${held.number} (${name})`,
        confirm: `Resume ${name} from #${held.number}? Your computer checked that #${held.number} is not on YouTube yet, so it uploads it next.`,
        description: 'Safe: the last check found it is not on YouTube.',
      });
    }
  }
  for (const archive of snapshot.archives) {
    if (archive.id === null) continue;
    actions.push({
      key: `monitor.scanNow:${archive.id}`,
      kind: 'monitor.scanNow',
      args: { archiveId: archive.id },
      label: `Scan ${archive.name || 'archive'} now`,
      confirm: null,
      description: 'Looks for new videos in this archive.',
    });
  }
  return actions;
}

export function isFinal(status: CommandStatus): boolean {
  return status === 'done' || status === 'rejected' || status === 'failed';
}

/** Pending for longer than the desktop accepts: it will be rejected. */
export function isExpired(row: Pick<CommandRow, 'status' | 'created_at'>, now: number): boolean {
  if (row.status !== 'pending') return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && now - created > COMMAND_EXPIRY_MS;
}

export function statusText(row: Pick<CommandRow, 'status' | 'created_at'>, now: number): string {
  if (isExpired(row, now)) return 'Expired: your computer did not pick it up in time';
  switch (row.status) {
    case 'pending':
      return 'Waiting for your computer';
    case 'accepted':
      return 'Your computer is working on it';
    case 'done':
      return 'Done';
    case 'rejected':
      return 'Refused by your computer';
    case 'failed':
      return 'Failed';
  }
}

export function parseCommandRow(raw: unknown): CommandRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const status = COMMAND_STATUSES.find((value) => value === row.status);
  if (typeof row.id !== 'string' || typeof row.kind !== 'string' || status === undefined) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind,
    args:
      typeof row.args === 'object' && row.args !== null && !Array.isArray(row.args)
        ? (row.args as Record<string, unknown>)
        : {},
    status,
    result_message: typeof row.result_message === 'string' ? row.result_message : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    handled_at: typeof row.handled_at === 'string' ? row.handled_at : null,
  };
}
