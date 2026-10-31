/**
 * Bridge to the Android app (android/ in this repo). Present only when this
 * page runs inside that app's WebView; in a browser it is undefined and
 * nothing changes.
 *
 * The app keeps the sign-in session in its own private storage so its
 * home-screen widget and background check can use the same session.
 */
export interface NativeBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** The computer the widget shows (null: the most recently seen one). */
  setDevice(id: string | null): void;
  /** Asks the widget to refresh now (after a command or a new status). */
  statusChanged(): void;
}

function isBridge(value: unknown): value is NativeBridge {
  if (typeof value !== 'object' || value === null) return false;
  const bridge = value as Record<string, unknown>;
  return ['getItem', 'setItem', 'removeItem', 'setDevice', 'statusChanged'].every(
    (name) => typeof bridge[name] === 'function',
  );
}

const candidate: unknown = (window as unknown as { DragonflyNative?: unknown }).DragonflyNative;
export const native: NativeBridge | undefined = isBridge(candidate) ? candidate : undefined;

/** supabase-js storage backed by the app, or undefined in a browser. */
export const nativeStorage = native
  ? {
      getItem: (key: string) => native.getItem(key),
      setItem: (key: string, value: string) => native.setItem(key, value),
      removeItem: (key: string) => native.removeItem(key),
    }
  : undefined;
