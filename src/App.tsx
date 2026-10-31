import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { native } from './native';
import type { Device } from './lib/devices';
import { autoSelect, parseDevice } from './lib/devices';
import { readStored, useNow, useOnline, useRefreshOnFocus, writeStored } from './hooks';
import { SignIn } from './screens/SignIn';
import { DevicesList } from './screens/Devices';
import { DeviceView } from './screens/DeviceView';

const DEVICE_KEY = 'dragonfly.companion.device';
const DEVICES_POLL_MS = 60_000;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const online = useOnline();
  const now = useNow();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      {!online && (
        <div className="banner offline" role="status">
          You are offline. Showing the last status this page received.
        </div>
      )}
      <div id="content">
        {!checked ? (
          <p className="muted center pad" aria-busy="true">
            Loading…
          </p>
        ) : session === null ? (
          <SignIn />
        ) : (
          <SignedIn session={session} now={now} />
        )}
      </div>
    </>
  );
}

function SignedIn({ session, now }: { session: Session; now: number }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => readStored(DEVICE_KEY));
  const [userPicked, setUserPicked] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('dragonfly_devices')
      .select('id, name, platform, app_version, last_seen_at, companion_control')
      .order('last_seen_at', { ascending: false });
    if (loadError) {
      // An expired or revoked session surfaces here; supabase-js signs out on
      // a failed refresh, which returns the app to the sign-in screen.
      if (loadError.code === 'PGRST301') void supabase.auth.signOut({ scope: 'local' });
      setError('Could not load your computers. Check your connection and try again.');
      return;
    }
    setError(null);
    const list = (data ?? []).map(parseDevice).filter((row): row is Device => row !== null);
    setDevices(list);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), DEVICES_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  useRefreshOnFocus(useCallback(() => void load(), [load]));

  // Open the remembered computer, or the only one, unless the user chose the list.
  useEffect(() => {
    if (devices === null || userPicked) return;
    const pick = autoSelect(devices, selected);
    if (pick !== selected) setSelected(pick);
  }, [devices, selected, userPicked]);

  // The Android widget shows the same computer as this page.
  useEffect(() => {
    if (selected !== null) native?.setDevice(selected);
  }, [selected]);

  function choose(id: string | null) {
    setUserPicked(true);
    setSelected(id);
    writeStored(DEVICE_KEY, id);
  }

  const device = devices?.find((item) => item.id === selected) ?? null;
  return (
    <div className="screen">
      <header className="topbar">
        {device ? (
          <button type="button" className="link" onClick={() => choose(null)}>
            ‹ Computers
          </button>
        ) : (
          <span className="topbar-title">
            <img src="./icons/favicon-32.png" alt="" width="24" height="24" /> Dragonfly
          </span>
        )}
        <button
          type="button"
          className="link"
          onClick={() => {
            writeStored(DEVICE_KEY, null);
            void supabase.auth.signOut({ scope: 'local' });
          }}
        >
          Sign out
        </button>
      </header>
      <main>
        {device ? (
          <DeviceView device={device} userId={session.user.id} now={now} />
        ) : (
          <>
            <h1>Your computers</h1>
            <DevicesList
              devices={devices}
              error={error}
              now={now}
              onSelect={(id) => choose(id)}
              onRetry={() => void load()}
            />
          </>
        )}
      </main>
    </div>
  );
}
