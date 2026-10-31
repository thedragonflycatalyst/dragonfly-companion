import { useState } from 'react';
import type { CommandAction, CommandRow } from '../lib/commands';
import { availableActions, isExpired, isFinal, statusText } from '../lib/commands';
import type { Snapshot } from '../lib/snapshot';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Props {
  control: boolean;
  snapshot: Snapshot | null;
  commands: CommandRow[];
  sending: boolean;
  sendError: string | null;
  now: number;
  onSend: (action: CommandAction) => void;
}

const KIND_LABEL: Record<string, string> = {
  'queue.pause': 'Pause queue',
  'queue.resume': 'Resume queue',
  'job.checkHold': 'Check held video',
  'job.resumeFromHeld': 'Resume from held video',
  'monitor.scanNow': 'Scan archive',
};

export function ActionsView({
  control,
  snapshot,
  commands,
  sending,
  sendError,
  now,
  onSend,
}: Props) {
  const [confirming, setConfirming] = useState<CommandAction | null>(null);

  if (!control) {
    return (
      <div className="card empty">
        <h2>Phone control is off</h2>
        <p>
          Turn on <strong>Allow phone control</strong> in the desktop app → Accounts → Phone
          companion.
        </p>
      </div>
    );
  }
  const actions = availableActions(snapshot, control);
  const busyKinds = new Set(
    commands
      .filter((row) => !isFinal(row.status) && !isExpired(row, now))
      .map((row) => commandKey(row)),
  );

  return (
    <div className="stack">
      <p className="muted small">
        Your computer carries these out with all its usual safety checks. Videos are never skipped.
      </p>
      {actions.length === 0 ? (
        <p className="muted">Nothing to do right now.</p>
      ) : (
        <ul className="actions">
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                className={action.confirm ? 'button primary block' : 'button secondary block'}
                disabled={sending || busyKinds.has(action.key)}
                onClick={() => (action.confirm ? setConfirming(action) : onSend(action))}
                aria-describedby={`desc-${action.key}`}
              >
                {action.label}
              </button>
              <p id={`desc-${action.key}`} className="muted small">
                {action.description}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div role="alert" className="form-error">
        {sendError}
      </div>
      <section aria-labelledby="sent-title">
        <h2 id="sent-title" className="section-title">
          Recent commands
        </h2>
        <ul className="commands" aria-live="polite" aria-relevant="additions text">
          {commands.length === 0 && <li className="muted">No commands sent yet.</li>}
          {commands.map((row) => {
            const expired = isExpired(row, now);
            const tone =
              expired || row.status === 'failed' || row.status === 'rejected'
                ? 'bad'
                : row.status === 'done'
                  ? 'ok'
                  : 'wait';
            return (
              <li key={row.id} className={`command ${tone}`}>
                <strong>{KIND_LABEL[row.kind] ?? row.kind}</strong>
                <span>{statusText(row, now)}</span>
                {row.result_message && <span className="muted small">{row.result_message}</span>}
              </li>
            );
          })}
        </ul>
      </section>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.label ?? ''}
        message={confirming?.confirm ?? ''}
        confirmLabel="Resume"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action) onSend(action);
        }}
      />
    </div>
  );
}

/** The action key a sent command belongs to, so its button waits while it runs. */
export function commandKey(row: Pick<CommandRow, 'kind' | 'args'>): string {
  const id = row.args.jobId ?? row.args.archiveId;
  return typeof id === 'string' || typeof id === 'number' ? `${row.kind}:${id}` : row.kind;
}
