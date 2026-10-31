import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionsView, commandKey } from '../src/screens/Actions';
import { StatusView } from '../src/screens/Status';
import { DevicesList } from '../src/screens/Devices';
import { autoSelect, parseDevice } from '../src/lib/devices';
import { parseSnapshot } from '../src/lib/snapshot';
import { NOW, fullSnapshot } from './fixtures';

const noop = () => undefined;
const actions = (control: boolean) =>
  renderToStaticMarkup(
    <ActionsView
      control={control}
      snapshot={parseSnapshot(fullSnapshot)}
      commands={[]}
      sending={false}
      sendError={null}
      now={NOW}
      onSend={noop}
    />,
  );

describe('screens', () => {
  it('shows the phone-control hint and no buttons when control is off', () => {
    const html = actions(false);
    expect(html).toContain('Allow phone control');
    expect(html).toContain('Accounts → Phone companion');
    expect(html).not.toContain('Pause queue');
  });
  it('shows command buttons and a live region when control is on', () => {
    const html = actions(true);
    expect(html).toContain('Pause queue');
    expect(html).toContain('Check held video on YouTube');
    expect(html).toContain('Scan Sample Archive now');
    expect(html).not.toContain('Resume from');
    expect(html).toContain('aria-live="polite"');
  });
  it('renders status with next upload, quota and held job', () => {
    const html = renderToStaticMarkup(
      <StatusView
        snapshot={parseSnapshot(fullSnapshot)}
        updatedAt={NOW - 30_000}
        loaded
        now={NOW}
      />,
    );
    expect(html).toContain('Next upload');
    expect(html).toContain('#42');
    expect(html).toContain('Uploads left today');
    expect(html).toContain('Made for kids not set');
    expect(html).toContain('Held at #42');
    expect(html).toContain('Sample Playlist');
    expect(html).toContain('Updated just now');
    expect(html).not.toContain('Not updated for a while');
  });
  it('warns when status is stale', () => {
    const html = renderToStaticMarkup(
      <StatusView
        snapshot={parseSnapshot(fullSnapshot)}
        updatedAt={NOW - 20 * 60_000}
        loaded
        now={NOW}
      />,
    );
    expect(html).toContain('Not updated for a while');
  });
  it('explains an empty device list', () => {
    const html = renderToStaticMarkup(
      <DevicesList devices={[]} error={null} now={NOW} onSelect={noop} onRetry={noop} />,
    );
    expect(html).toContain('No computers yet');
    expect(html).toContain('Share status with my phone');
  });
  it('shows online and offline devices', () => {
    const devices = [
      parseDevice({
        id: 'd1',
        name: 'test-pc',
        platform: 'win32',
        app_version: '1.0.0',
        last_seen_at: new Date(NOW - 60_000).toISOString(),
        companion_control: true,
      }),
      parseDevice({
        id: 'd2',
        name: 'old-mac',
        platform: 'darwin',
        app_version: '1.0.0',
        last_seen_at: new Date(NOW - 3_600_000).toISOString(),
      }),
    ].filter((d) => d !== null);
    const html = renderToStaticMarkup(
      <DevicesList devices={devices} error={null} now={NOW} onSelect={noop} onRetry={noop} />,
    );
    expect(html).toContain('Online');
    expect(html).toContain('Offline · 1 h ago');
    expect(html).toContain('aria-label="Windows"');
    expect(html).toContain('aria-label="macOS"');
  });
  it('auto-selects the only or remembered device', () => {
    const one = parseDevice({ id: 'd1' });
    const two = parseDevice({ id: 'd2' });
    if (!one || !two) throw new Error('fixture');
    expect(autoSelect([one], null)).toBe('d1');
    expect(autoSelect([one, two], null)).toBeNull();
    expect(autoSelect([one, two], 'd2')).toBe('d2');
    expect(autoSelect([one, two], 'gone')).toBeNull();
    expect(autoSelect([], null)).toBeNull();
  });
  it('keys commands to their target', () => {
    expect(commandKey({ kind: 'job.checkHold', args: { jobId: 'job-1' } })).toBe(
      'job.checkHold:job-1',
    );
    expect(commandKey({ kind: 'queue.pause', args: {} })).toBe('queue.pause');
  });
});
