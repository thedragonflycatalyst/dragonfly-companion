/** A computer counts as offline when it has not been seen for this long. */
export const OFFLINE_AFTER_MS = 10 * 60 * 1000;
/** A status snapshot older than this is shown with a stale warning. */
export const STALE_AFTER_MS = 10 * 60 * 1000;
/** The desktop rejects pending commands older than this. */
export const COMMAND_EXPIRY_MS = 10 * 60 * 1000;

export function parseTime(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isOnline(lastSeenAt: string | number | null | undefined, now: number): boolean {
  const seen = parseTime(lastSeenAt);
  return seen !== null && now - seen < OFFLINE_AFTER_MS;
}

/** Stale when unknown or older than the threshold. */
export function isStale(updatedAt: number | null, now: number): boolean {
  return updatedAt === null || now - updatedAt > STALE_AFTER_MS;
}

export function relativeTime(at: number | null, now: number): string {
  if (at === null) return 'never';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function clockTime(at: number | null): string {
  if (at === null) return '';
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
