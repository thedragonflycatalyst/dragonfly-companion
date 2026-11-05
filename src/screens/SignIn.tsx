import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { LoginError, loginMessage, loginTarget, usernameLogin } from '../lib/login';
import { rememberLogin, setRememberLogin } from '../lib/remember';

export function SignIn() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(rememberLogin());
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const target = loginTarget(identifier);
    if (target.kind === 'invalid' || !password) {
      setError(loginMessage(new LoginError('invalid_credentials')));
      return;
    }
    setBusy(true);
    setRememberLogin(remember);
    try {
      if (target.kind === 'email') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: target.email,
          password,
        });
        if (authError) {
          const status = authError.status ?? 0;
          throw new LoginError(
            status === 429
              ? 'rate_limited'
              : status >= 400 && status < 500
                ? 'invalid_credentials'
                : 'unavailable',
          );
        }
      } else {
        const tokens = await usernameLogin(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          target.username,
          password,
        );
        const { error: sessionError } = await supabase.auth.setSession(tokens);
        if (sessionError) throw new LoginError('unavailable');
      }
      setPassword('');
    } catch (caught) {
      setError(loginMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen narrow" aria-labelledby="signin-title">
      <div className="brand">
        <img src="./icons/icon-192.png" alt="" width="72" height="72" />
        <h1 id="signin-title">Dragonfly Companion</h1>
        <p className="muted">Sign in with your Dragonfly account to see your computer.</p>
      </div>
      <form className="card form" onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="identifier">Email or username</label>
        <input
          id="identifier"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label className="account-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Keep me signed in on this device
        </label>
        <div role="alert" className="form-error" aria-live="assertive">
          {error}
        </div>
        <button type="submit" className="button primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted small center">
        No account yet? Create one in Dragonfly Uploader on your computer.
      </p>
    </main>
  );
}
