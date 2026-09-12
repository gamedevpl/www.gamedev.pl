import { useCallback, useEffect, useState } from 'react';
import './admin-small-panels.css';
import {
  fetchModerationFlags,
  resolveModerationFlag,
  type ModerationFlagRow,
  type ModerationResolveResult,
} from './moderationApi.js';

const REASON_LABELS: Record<string, string> = {
  sexual: 'Sexual content',
  hate: 'Hate or slurs',
  violence: 'Gratuitous violence',
  targets_person: 'Targets a real person',
  infringing: 'Infringing material',
  other: 'Something else',
};

// Says what the takedown reached, and what it could not.
function outcomeLine(outcome: ModerationResolveResult): string {
  if (outcome.stillPublic) {
    return 'Draft link closed, but the game is still published from the games repo — pull it there.';
  }
  const did = [
    outcome.unpublished ? 'unpublished' : null,
    outcome.unshared ? 'closed the share link' : null,
    outcome.blocked ? 'blocked re-sharing' : null,
  ].filter(Boolean);
  return did.length ? `Done: ${did.join(', ')}.` : 'Nothing was live to pull.';
}

export function ModerationPanel() {
  const [flags, setFlags] = useState<ModerationFlagRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchModerationFlags('open');
      if (rows === null) {
        setState('forbidden');
        return;
      }
      setFlags(rows);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(flag: ModerationFlagRow, action: 'taken_down' | 'dismissed') {
    setBusyId(flag.id);
    setMessage(null);
    try {
      const outcome = await resolveModerationFlag(flag.id, action, notes[flag.id]);
      setMessage(action === 'taken_down' ? `${flag.slug}: ${outcomeLine(outcome)}` : `${flag.slug}: dismissed.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resolve that report.');
    } finally {
      setBusyId(null);
    }
  }

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading reports…</p>;
  if (state === 'error') return <p className="health-empty">Could not read reports.</p>;

  return (
    <section className="admin-moderation" aria-label="Moderation reports">
      <h2 className="health-section-title">Abuse reports</h2>
      <p className="health-summary">
        One credible report is actionable on its own. Taking a game down closes its share link and blocks the creator
        from re-opening it.
      </p>

      {message ? (
        <p className="admin-limits-message" role="status">
          {message}
        </p>
      ) : null}

      {flags.length === 0 ? (
        <p className="health-empty">No open reports.</p>
      ) : (
        <ul className="admin-moderation-list">
          {flags.map((flag) => (
            <li key={flag.id} className="admin-moderation-item">
              <div className="admin-moderation-head">
                <a href={`/play/${flag.slug}`}>{flag.slug}</a>
                <span className="admin-moderation-reason">{REASON_LABELS[flag.reason] ?? flag.reason}</span>
                <span className="admin-moderation-when">{new Date(flag.createdAt).toLocaleString()}</span>
              </div>
              <p className="admin-moderation-note">{flag.note}</p>
              <div className="admin-moderation-actions">
                <input
                  type="text"
                  className="admin-moderation-resolution"
                  placeholder="What you did (optional)"
                  value={notes[flag.id] ?? ''}
                  disabled={busyId === flag.id}
                  onChange={(event) => setNotes((prev) => ({ ...prev, [flag.id]: event.target.value }))}
                />
                <button
                  type="button"
                  className="admin-moderation-dismiss"
                  disabled={busyId === flag.id}
                  onClick={() => void resolve(flag, 'dismissed')}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="admin-moderation-takedown"
                  disabled={busyId === flag.id}
                  onClick={() => void resolve(flag, 'taken_down')}
                >
                  Take down
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
