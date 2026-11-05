import { readStored, writeStored } from '../hooks';

/** Per-device opt-out only. Supabase owns the refresh tokens; no password
 * or biometric material is stored by this preference.
 */
const KEY = 'dragonfly.companion.remember-login';
export function rememberLogin(): boolean {
  return readStored(KEY) !== 'false';
}
export function setRememberLogin(remember: boolean): void {
  writeStored(KEY, remember ? 'true' : 'false');
}
