import { describe, expect, it } from 'vitest';
import {
  OFFLINE_AFTER_MS,
  STALE_AFTER_MS,
  isOnline,
  isStale,
  parseTime,
  relativeTime,
} from '../src/lib/time';
import { NOW } from './fixtures';

describe('online and stale', () => {
  it('is online within 10 minutes of last_seen_at', () => {
    expect(isOnline(new Date(NOW - 60_000).toISOString(), NOW)).toBe(true);
    expect(isOnline(new Date(NOW - OFFLINE_AFTER_MS + 1).toISOString(), NOW)).toBe(true);
  });
  it('is offline at 10 minutes or more, or when unknown', () => {
    expect(isOnline(new Date(NOW - OFFLINE_AFTER_MS).toISOString(), NOW)).toBe(false);
    expect(isOnline(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe(false);
    expect(isOnline('', NOW)).toBe(false);
    expect(isOnline('garbage', NOW)).toBe(false);
    expect(isOnline(null, NOW)).toBe(false);
  });
  it('is stale after 10 minutes or when unknown', () => {
    expect(isStale(NOW - 60_000, NOW)).toBe(false);
    expect(isStale(NOW - STALE_AFTER_MS, NOW)).toBe(false);
    expect(isStale(NOW - STALE_AFTER_MS - 1, NOW)).toBe(true);
    expect(isStale(null, NOW)).toBe(true);
  });
  it('parses times', () => {
    expect(parseTime('2026-10-31T12:00:00Z')).toBe(NOW);
    expect(parseTime(undefined)).toBeNull();
  });
  it('formats relative times', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(relativeTime(NOW + 10_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(relativeTime(NOW - 86_400_000, NOW)).toBe('1 day ago');
    expect(relativeTime(null, NOW)).toBe('never');
  });
});
