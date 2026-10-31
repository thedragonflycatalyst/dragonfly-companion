import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import type { Device } from '../lib/devices';
import type { CommandAction, CommandRow } from '../lib/commands';
import { isFinal, parseCommandRow } from '../lib/commands';
import type { Snapshot } from '../lib/snapshot';
import { parseSnapshot } from '../lib/snapshot';
import { isOnline, parseTime } from '../lib/time';
import { useRefreshOnFocus } from '../hooks';
import { StatusView } from './Status';
import { ActionsView } from './Actions';

interface Props {
  device: Device;
  userId: string;
  now: number;
}

type Tab = 'status' | 'actions';
const STATUS_POLL_MS = 60_000;
const COMMAND_POLL_MS = 5_000;
const COMMANDS_SHOWN = 10;

export function DeviceView({ device, userId, now }: Props) {
  const [tab, setTab] = useState<Tab>('status');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const deviceId = device.id;

  const applyStatus = useCallback((row: unknown) => {
    if (typeof row !== 'object' || row === null) return;
    const record = row as Record<string, unknown>;
    setSnapshot(parseSnapshot(record.snapshot));
    setUpdatedAt(parseTime(typeof record.updated_at === 'string' ? record.updated_at : null));
  }, []);

  const mergeCommand = useCallback((raw: unknown) => {
    const row = parseCommandRow(raw);
    if (row === null) return;
    setCommands((current) => {
      const others = current.filter((item) => item.id !== row.id);
      return [row, ...others]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, COMMANDS_SHOWN);
    });
  }, []);

  const loadStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('dragonfly_device_status')
      .select('snapshot, updated_at')
      .eq('device_id', deviceId)
      .maybeSingle();
    if (!error) {
      if (data) applyStatus(data);
      else {
        setSnapshot(null);
        setUpdatedAt(null);
      }
    }
    setLoaded(true);
  }, [deviceId, applyStatus]);

  const loadCommands = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('dragonfly_device_commands')
      .select('id, kind, args, status, result_message, created_at, handled_at')
      .eq('device_id', deviceId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(COMMANDS_SHOWN);
    if (!error && Array.isArray(data)) {
      setCommands(data.map(parseCommandRow).filter((row): row is CommandRow => row !== null));
    }
  }, [deviceId]);

  const refresh = useCallback(() => {
    void loadStatus();
    void loadCommands();
  }, [loadStatus, loadCommands]);

  // Initial load, live updates and a slow poll as a fallback.
  useEffect(() => {
    setLoaded(false);
    setSnapshot(null);
    setUpdatedAt(null);
    setCommands([]);
    refresh();
    const channel = supabase
      .channel(`companion-device-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dragonfly_device_status',
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSnapshot(null);
            setUpdatedAt(null);
          } else applyStatus(payload.new);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dragonfly_device_commands',
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          if (payload.eventType !== 'DELETE') mergeCommand(payload.new);
        },
      )
      .subscribe();
    const timer = window.setInterval(() => void loadStatus(), STATUS_POLL_MS);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [deviceId, refresh, loadStatus, applyStatus, mergeCommand]);

  // While a command is still open, poll it quickly in case realtime is down.
  const open = commands.some((row) => !isFinal(row.status));
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (openRef.current) void loadCommands();
    }, COMMAND_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, loadCommands]);

  useRefreshOnFocus(refresh);

  async function send(action: CommandAction) {
    setSending(true);
    setSendError(null);
    const { data, error } = await supabase
      .from('dragonfly_device_commands')
      .insert({
        user_id: userId,
        device_id: deviceId,
        kind: action.kind,
        args: action.args,
        status: 'pending',
      })
      .select('id, kind, args, status, result_message, created_at, handled_at')
      .single();
    setSending(false);
    if (error) {
      const text = `${error.message} ${error.details ?? ''}`.toLowerCase();
      setSendError(
        text.includes('rate') || text.includes('limit')
          ? 'Too many commands in the last hour. Try again later.'
          : 'Could not send that. Check your connection and try again.',
      );
      return;
    }
    mergeCommand(data);
  }

  const online = isOnline(device.last_seen_at, now);
  return (
    <div className="stack">
      <div className="device-heading">
        <h1>{device.name}</h1>
        <span className={online ? 'pill ok' : 'pill off'}>
          <span className="dot" aria-hidden="true" />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="tabs" role="tablist" aria-label="Computer">
        {(['status', 'actions'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`panel-${name}`}
            className={tab === name ? 'tab active' : 'tab'}
            onClick={() => setTab(name)}
          >
            {name === 'status' ? 'Status' : 'Actions'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'status' ? (
          <StatusView snapshot={snapshot} updatedAt={updatedAt} loaded={loaded} now={now} />
        ) : (
          <ActionsView
            control={device.companion_control}
            snapshot={snapshot}
            commands={commands}
            sending={sending}
            sendError={sendError}
            now={now}
            onSend={(action) => void send(action)}
          />
        )}
      </div>
    </div>
  );
}
