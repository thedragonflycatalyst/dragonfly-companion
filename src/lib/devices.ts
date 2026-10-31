export interface Device {
  id: string;
  name: string;
  platform: string;
  app_version: string;
  last_seen_at: string;
  companion_control: boolean;
}

export function parseDevice(raw: unknown): Device | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string') return null;
  return {
    id: row.id,
    name: typeof row.name === 'string' && row.name ? row.name : 'Computer',
    platform: typeof row.platform === 'string' ? row.platform : '',
    app_version: typeof row.app_version === 'string' ? row.app_version : '',
    last_seen_at: typeof row.last_seen_at === 'string' ? row.last_seen_at : '',
    companion_control: row.companion_control === true,
  };
}

export function platformName(platform: string): string {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return 'Computer';
}

/** The device to open straight away: the remembered one, or the only one. */
export function autoSelect(devices: readonly Device[], remembered: string | null): string | null {
  if (remembered !== null && devices.some((device) => device.id === remembered)) return remembered;
  const only = devices.length === 1 ? devices[0] : undefined;
  return only ? only.id : null;
}
