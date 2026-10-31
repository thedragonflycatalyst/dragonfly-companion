/** Same username rule as the desktop app and the server. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/;

export type LoginTarget =
  | { kind: 'email'; email: string }
  | { kind: 'username'; username: string }
  | { kind: 'invalid' };

export function loginTarget(identifier: string): LoginTarget {
  const value = identifier.trim();
  if (value.includes('@')) return { kind: 'email', email: value };
  if (USERNAME_PATTERN.test(value)) return { kind: 'username', username: value };
  return { kind: 'invalid' };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export class LoginError extends Error {
  constructor(
    readonly code: 'invalid_credentials' | 'rate_limited' | 'unavailable' | 'username_unreachable',
  ) {
    super(code);
    this.name = 'LoginError';
  }
}

export function loginMessage(error: unknown): string {
  const code = error instanceof LoginError ? error.code : 'unavailable';
  switch (code) {
    case 'invalid_credentials':
      return 'That sign-in did not work. Check your email or username and password.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'username_unreachable':
      return 'Signing in with a username is not available here yet. Use your email address instead.';
    case 'unavailable':
      return 'Could not reach Dragonfly. Check your connection and try again.';
  }
}

/**
 * Resolves a username sign-in on the server (the phone never learns the
 * email). Returns the session tokens for supabase.auth.setSession.
 */
export async function usernameLogin(
  baseUrl: string,
  publicKey: string,
  username: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<TokenPair> {
  let reply: Response;
  try {
    reply = await fetcher(`${baseUrl.replace(/\/+$/, '')}/functions/v1/dragonfly-username-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publicKey },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
  } catch {
    // A network failure here is almost always the browser blocking the call
    // (the function must answer CORS preflight for the companion's origin).
    throw new LoginError(navigator.onLine === false ? 'unavailable' : 'username_unreachable');
  }
  if (reply.status === 401) throw new LoginError('invalid_credentials');
  if (reply.status === 429) throw new LoginError('rate_limited');
  if (!reply.ok) throw new LoginError('unavailable');
  const data = (await reply.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    data === null ||
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string'
  ) {
    throw new LoginError('unavailable');
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}
