import { useCallback, useEffect, useState } from 'react';
import { AccessTokensPanel } from './AccessTokensPanel.js';
import { AdminJobsPanel } from './AdminJobsPanel.js';
import { CostsPanel } from './CostsPanel.js';
import { CreationLimitsPanel } from './CreationLimitsPanel.js';
import { GameHealthView } from './GameHealthView.js';
import { SuggestionsPanel } from './SuggestionsPanel.js';
import { fetchAdminSummary, type AdminSummary, type OperatorAlert } from './adminApi.js';
import { ADMIN_SECTIONS, adminPath, type AdminSection } from './router.js';

/**
 * One place for everything an operator can do.
 *
 * Before this the operator surfaces were four endpoints and one page: the queue and the
 * telemetry shared `/health`, the creation breaker and the access tokens had no UI at
 * all, and the suggestion router — which will eventually file work against people's
 * games — could only be inspected with curl. Anything without a page was, in practice,
 * something that did not get used.
 *
 * Deliberately untranslated, like the telemetry view it absorbs: one person reads this,
 * and a dozen locale keys per panel would cost more than they explain.
 */

const SECTION_LABELS: Record<AdminSection, string> = {
  queue: 'Queue',
  costs: 'Cost',
  telemetry: 'Telemetry',
  limits: 'Limits',
  tokens: 'Tokens',
  suggestions: 'Suggestions',
};

const ALERT_COPY: Record<OperatorAlert['kind'], string> = {
  review_ready: 'waiting to be published',
  build_failed: 'failed',
  build_stalled: 'stopped moving',
  // Names the suspect, because this one is never about the game: the request landed
  // and the relay that wakes an agent for it did not fire.
  feedback_undelivered: 'change request never collected — check the relay',
};

/** Rough age, in the same vocabulary the queue uses. */
function since(at: string, now: number): string {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * What is waiting on the person reading, above whatever section they opened.
 *
 * Shown on every section rather than only on the queue: the reason to consolidate these
 * pages is that an operator opens one of them and finds out about the others, and an
 * alert visible only on the page you had to already be on would not be an alert.
 */
function AlertBanner({ alerts }: { alerts: OperatorAlert[] }) {
  const now = Date.now();
  if (alerts.length === 0) {
    return <p className="admin-alerts admin-alerts--clear">Nothing waiting on you.</p>;
  }
  return (
    <ul className="admin-alerts">
      {alerts.map((alert) => (
        <li key={alert.id} className={`admin-alert admin-alert--${alert.kind}`}>
          <span className="admin-alert-title">{alert.title}</span>{' '}
          <span className="admin-alert-kind">
            {ALERT_COPY[alert.kind]}
            {alert.stall ? ` (${alert.stall})` : ''}
          </span>{' '}
          <span className="admin-alert-age">
            #{alert.issueNumber} · {since(alert.since, now)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AdminConsole({ section, onNavigate }: { section: AdminSection; onNavigate: (path: string) => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const response = await fetchAdminSummary();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setSummary(response);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    // Same cadence and the same reason as the queue's own poll: this is a page someone
    // leaves open while a build runs, and it costs one store read.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // The same answer the API gives a non-operator: nothing here, and no hint that there
  // could be. Rendered before anything else so no section ever loads for a stranger.
  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;

  return (
    <section className="admin-console">
      <header className="admin-console-header">
        <h1>Operator</h1>
        {summary && (
          <p className="admin-console-counts">
            {summary.queue.active} active · {summary.queue.stalled} stalled · {summary.limits.todaySubmissions}/
            {summary.limits.globalDailySubmissionCap} today
            {summary.limits.paused ? ' · creation paused' : ''}
          </p>
        )}
      </header>

      <nav className="admin-tabs">
        {ADMIN_SECTIONS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={candidate === section ? 'admin-tab is-active' : 'admin-tab'}
            aria-current={candidate === section ? 'page' : undefined}
            onClick={() => onNavigate(adminPath(candidate))}
          >
            {SECTION_LABELS[candidate]}
            {candidate === 'queue' && summary && summary.alerts.length > 0 ? (
              <span className="admin-tab-badge">{summary.alerts.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {state === 'error' && <p className="health-empty">Could not read the console summary.</p>}
      {summary && <AlertBanner alerts={summary.alerts} />}

      {section === 'queue' && <AdminJobsPanel />}
      {section === 'costs' && <CostsPanel />}
      {section === 'telemetry' && <GameHealthView />}
      {section === 'limits' && <CreationLimitsPanel onChanged={() => void load()} />}
      {section === 'tokens' && <AccessTokensPanel />}
      {section === 'suggestions' && <SuggestionsPanel />}
    </section>
  );
}
