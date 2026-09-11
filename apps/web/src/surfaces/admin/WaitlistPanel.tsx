import { useCallback, useEffect, useRef, useState } from 'react';
import './admin-small-panels.css';
import {
  createBetaInvite,
  fetchBetaInvites,
  fetchWaitlist,
  revokeBetaInvite,
  type BetaInvite,
  setWaitlistStatus,
  setWaitlistStatusByEmail,
  type WaitlistEntry,
  type WaitlistStatus,
} from './adminApi.js';
import { betaInvitePath } from '../../core/router.js';

/**
 * Closed-beta waitlist membership — list, approve, reject, pre-approve by email.
 *
 * Until this panel the only verbs were `npm run beta:approve` and the Firestore
 * console. Approving someone from a phone mid-day is the whole point: a join
 * notification that links here should end in a status change, not in "find a
 * laptop".
 *
 * Pre-approve by email matches the CLI: if they have never visited, an
 * `email:user@…` row is created so the first verified sign-in grants access.
 */

const FILTERS: Array<{ value: WaitlistStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

function since(at: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(at));
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function WaitlistPanel() {
  const [filter, setFilter] = useState<WaitlistStatus | 'all'>('pending');
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<BetaInvite[] | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  // Monotonic id so a slow Pending fetch cannot overwrite an Approved list the
  // operator already switched to (Copilot + Codex both flagged this race).
  const loadGeneration = useRef(0);

  const load = useCallback(async (status: WaitlistStatus | 'all') => {
    const generation = ++loadGeneration.current;
    try {
      const result = await fetchWaitlist(status);
      if (generation !== loadGeneration.current) return;
      if (result === null) {
        setState('forbidden');
        return;
      }
      setEntries(result);
      setState('ready');
    } catch {
      if (generation !== loadGeneration.current) return;
      setState('error');
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const result = await fetchBetaInvites();
      if (result !== null) setInvites(result);
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    setState('loading');
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const changeStatus = useCallback(
    async (uid: string, status: WaitlistStatus) => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await setWaitlistStatus(uid, status);
        if ('error' in result) {
          setMessage(result.error);
          return;
        }
        setMessage(`${result.email ?? result.uid} → ${status}`);
        await load(filter);
      } catch {
        setMessage('could not reach the API');
      } finally {
        setBusy(false);
      }
    },
    [filter, load],
  );

  const preapprove = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await setWaitlistStatusByEmail(trimmed, 'approved');
      if ('error' in result) {
        setMessage(result.error);
        return;
      }
      setEmail('');
      setMessage(`approved ${result.email ?? result.uid}`);
      // An approve against a pending filter would disappear from the list; switch so
      // the row the operator just wrote is still on screen.
      if (filter === 'pending') setFilter('approved');
      else await load(filter);
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  }, [email, filter, load]);

  const makeInvite = useCallback(async () => {
    setInviteBusy(true);
    setMessage(null);
    try {
      const result = await createBetaInvite();
      if ('error' in result) {
        setMessage(result.error);
        return;
      }
      setInviteLink(new URL(betaInvitePath(result.code), window.location.origin).toString());
      setMessage('Invite link created. It can be used once.');
      await loadInvites();
    } catch {
      setMessage('could not reach the API');
    } finally {
      setInviteBusy(false);
    }
  }, [loadInvites]);

  const copyInvite = useCallback(async () => {
    if (!inviteLink || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage('Invite link copied.');
    } catch {
      setMessage('Copy failed — select the link manually.');
    }
  }, [inviteLink]);

  const revokeInvite = useCallback(
    async (id: string) => {
      setInviteBusy(true);
      setMessage(null);
      try {
        const result = await revokeBetaInvite(id);
        if ('error' in result) {
          setMessage(result.error);
          return;
        }
        setMessage('Invite link revoked.');
        await loadInvites();
      } catch {
        setMessage('could not reach the API');
      } finally {
        setInviteBusy(false);
      }
    },
    [loadInvites],
  );

  // Filters stay mounted during the first load so a slow Pending fetch cannot
  // trap the operator — they can switch to Approved while it is still in flight,
  // which is also the race the generation guard below exists for.
  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;

  const now = Date.now();

  return (
    <section className="admin-waitlist">
      <h2 className="health-section-title">Waitlist</h2>
      <p className="health-summary">
        Closed-beta membership. Approving grants sign-in without a redeploy; rejecting or resetting updates the same
        Firestore row the CLI writes.
      </p>

      <section className="admin-beta-invites">
        <h3>One-time invite links</h3>
        <p className="health-summary">
          Create a link for someone whose email you do not know. The first account to accept it gets access; the link
          cannot be reused.
        </p>
        <button type="button" disabled={inviteBusy} onClick={() => void makeInvite()}>
          Create invite link
        </button>
        {inviteLink && (
          <div className="admin-beta-invite-created">
            <input
              aria-label="New beta invite link"
              readOnly
              value={inviteLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" disabled={inviteBusy} onClick={() => void copyInvite()}>
              Copy link
            </button>
          </div>
        )}
        {invites && invites.length > 0 && (
          <div className="health-table-scroll">
            <table className="health-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Claimed by</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.status}</td>
                    <td title={invite.createdAt}>{since(invite.createdAt, now)}</td>
                    <td>{invite.claimedUid ?? '—'}</td>
                    <td>
                      {invite.status === 'available' && (
                        <button type="button" disabled={inviteBusy} onClick={() => void revokeInvite(invite.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="admin-waitlist-filters" role="group" aria-label="Filter by status">
        {FILTERS.map((candidate) => (
          <button
            key={candidate.value}
            type="button"
            className={candidate.value === filter ? 'is-active' : undefined}
            disabled={busy}
            onClick={() => setFilter(candidate.value)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="admin-tokens-form">
        <label>
          Pre-approve email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="friend@example.com"
            disabled={busy}
          />
        </label>
        <button type="button" disabled={busy || !email.trim()} onClick={() => void preapprove()}>
          Approve
        </button>
      </div>

      {message && <p className="admin-limits-message">{message}</p>}

      {state === 'loading' && !entries && <p className="health-empty">Reading the waitlist…</p>}
      {state === 'error' && !entries && <p className="health-empty">Could not read the waitlist.</p>}

      {entries && entries.length === 0 && (
        <p className="health-empty">{filter === 'pending' ? 'Nobody is waiting.' : 'No entries in this filter.'}</p>
      )}

      {entries && entries.length > 0 && (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.uid} className={`admin-waitlist-row is-${entry.status}`}>
                  <td>
                    <div className="admin-waitlist-person">
                      <span className="admin-waitlist-name">{entry.name ?? entry.email ?? entry.uid}</span>
                      {entry.email && entry.name ? <span className="admin-waitlist-email">{entry.email}</span> : null}
                      <span className="admin-waitlist-uid">{entry.uid}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-waitlist-status is-${entry.status}`}>{entry.status}</span>
                  </td>
                  <td title={entry.requestedAt}>{since(entry.requestedAt, now)}</td>
                  <td className="admin-waitlist-actions">
                    {entry.status !== 'approved' && (
                      <button type="button" disabled={busy} onClick={() => void changeStatus(entry.uid, 'approved')}>
                        Approve
                      </button>
                    )}
                    {entry.status !== 'rejected' && (
                      <button type="button" disabled={busy} onClick={() => void changeStatus(entry.uid, 'rejected')}>
                        Reject
                      </button>
                    )}
                    {entry.status !== 'pending' && (
                      <button type="button" disabled={busy} onClick={() => void changeStatus(entry.uid, 'pending')}>
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
