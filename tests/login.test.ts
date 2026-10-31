import { describe, expect, it } from 'vitest';
import { LoginError, loginMessage, loginTarget, usernameLogin } from '../src/lib/login';

const reply = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

describe('login', () => {
  it('routes emails and usernames', () => {
    expect(loginTarget(' someone@example.com ')).toEqual({
      kind: 'email',
      email: 'someone@example.com',
    });
    expect(loginTarget('test_user')).toEqual({ kind: 'username', username: 'test_user' });
    expect(loginTarget('ab')).toEqual({ kind: 'invalid' });
    expect(loginTarget('_bad')).toEqual({ kind: 'invalid' });
  });
  it('returns tokens from the username function', async () => {
    let url = '';
    const tokens = await usernameLogin('https://x.example/', 'pk', 'test_user', 'pw', (input) => {
      url = String(input);
      return reply(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: {} });
    });
    expect(url).toBe('https://x.example/functions/v1/dragonfly-username-login');
    expect(tokens).toEqual({ access_token: 'a', refresh_token: 'r' });
  });
  it('maps failures', async () => {
    const code = async (fetcher: typeof fetch) => {
      try {
        await usernameLogin('https://x.example', 'pk', 'test_user', 'pw', fetcher);
        return 'ok';
      } catch (error) {
        return error instanceof LoginError ? error.code : 'other';
      }
    };
    expect(await code(() => reply(401, {}))).toBe('invalid_credentials');
    expect(await code(() => reply(429, {}))).toBe('rate_limited');
    expect(await code(() => reply(503, {}))).toBe('unavailable');
    expect(await code(() => reply(200, { access_token: 1 }))).toBe('unavailable');
    expect(await code(() => Promise.reject(new TypeError('Failed to fetch')))).toBe(
      'username_unreachable',
    );
    expect(loginMessage(new LoginError('username_unreachable'))).toMatch(/email address/);
  });
});
