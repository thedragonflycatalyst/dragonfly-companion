import type { Device } from '../lib/devices';
import { platformName } from '../lib/devices';
import { isOnline, parseTime, relativeTime } from '../lib/time';
import { PlatformIcon } from '../components/PlatformIcon';

interface Props {
  devices: Device[] | null;
  error: string | null;
  now: number;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

export function DevicesList({ devices, error, now, onSelect, onRetry }: Props) {
  if (error !== null) {
    return (
      <div className="card empty" role="alert">
        <p>{error}</p>
        <button type="button" className="button secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (devices === null)
    return (
      <p className="muted" aria-busy="true">
        Loading your computers…
      </p>
    );
  if (devices.length === 0) {
    return (
      <div className="card empty">
        <h2>No computers yet</h2>
        <p>
          Open Dragonfly Uploader on your computer, sign in, and turn on{' '}
          <strong>Share status with my phone</strong>.
        </p>
        <button type="button" className="button secondary" onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }
  return (
    <ul className="device-list" aria-label="Your computers">
      {devices.map((device) => {
        const online = isOnline(device.last_seen_at, now);
        const seen = relativeTime(parseTime(device.last_seen_at), now);
        return (
          <li key={device.id}>
            <button type="button" className="device" onClick={() => onSelect(device.id)}>
              <PlatformIcon platform={device.platform} />
              <span className="device-text">
                <span className="device-name">{device.name}</span>
                <span className="muted small">
                  {platformName(device.platform)}
                  {device.app_version ? ` · v${device.app_version}` : ''}
                </span>
              </span>
              <span className={online ? 'pill ok' : 'pill off'}>
                <span className="dot" aria-hidden="true" />
                {online ? 'Online' : `Offline · ${seen}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
