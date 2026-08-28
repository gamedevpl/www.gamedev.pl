import { useCallback, useEffect, useState } from 'react';
import { AccessTokensPanel } from './AccessTokensPanel.js';
import { AdminJobsPanel } from './AdminJobsPanel.js';
import { CostsPanel } from './CostsPanel.js';
import { CreationLimitsPanel } from './CreationLimitsPanel.js';
import { GameHealthView } from '../../GameHealthView.js';
import { ProposalReviewPanel } from '../../ProposalReviewPanel.js';
import { SuggestionsPanel } from './SuggestionsPanel.js';
import { WaitlistPanel } from './WaitlistPanel.js';
import { AdminAssessmentsPanel } from './AdminAssessmentsPanel.js';
import { fetchAdminSummary, type AdminSummary, type OperatorAlert } from './adminApi.js';
import { ADMIN_SECTIONS, adminPath, type AdminSection } from '../../router.js';

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
  proposals: 'Proposals',
  waitlist: 'Waitlist',
  assessments: 'Assessments',
};

const ALERT_COPY: Record<OperatorAlert['kind'], string> = {
  review_ready: 'waiting to be published',
  build_failed: 'failed',
  build_stalled: 'stopped moving',
  // Names the suspect, because this one is never about the game: the request landed
  // and the relay that wakes an agent for it did not fire.
  feedback_undelivered: 'change request never collected — check the relay',
  game_unhealthy: 'live game failing on the current engine — creator nudged',
  // The only kind that is about the platform rather than a game: seeding fails open, so
  // the builds themselves are fine and the cost is silent.
  seeding_degraded: 'started from an empty directory — round 0 generated nothing, or nothing could place it',
};

/** The same kinds again, short enough to sit several to a line in the summary. */
const ALERT_SHORT: Record<OperatorAlert['kind'], string> = {
  review_ready: 'ready to publish',
  build_failed: 'failed',
  build_stalled: 'stopped',
  feedback_undelivered: 'undelivered feedback',
  game_unhealthy: 'unhealthy live game',
  seeding_degraded: 'round 0 not landing',
};

/** Rough age, in the same vocabulary the queue uses. */
function since(at: string, now: number): string {
  // Clamped, because these two clocks are not the same clock: `at` is the server's and
  // `now` is the browser's, and a browser running a minute behind would otherwise
  // report a build as having been waiting "-1m".
  const ms = Math.max(0, now - Date.parse(at));
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** "2 ready to publish, 1 stopped" — the whole banner, when it is closed. */
function summarize(alerts: OperatorAlert[]): string {
  const counts = new Map<OperatorAlert['kind'], number>();
  // Insertion order is the server's severity order, so the summary leads with the same
  // thing the list would.
  for (const alert of alerts) counts.set(alert.kind, (counts.get(alert.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${count} ${ALERT_SHORT[kind]}`).join(', ');
}

/**
 * What is waiting on the person reading, above whatever section they opened.
 *
 * Shown on every section rather than only on the queue: the reason to consolidate these
 * pages is that an operator opens one of them and finds out about the others, and an
 * alert visible only on the page you had to already be on would not be an alert.
 *
 * But it is one line until asked, and nothing at all when there is nothing waiting. The
 * first version was a stack of boxes between the tabs and the section on every page,
 * including a permanent "Nothing waiting on you." — which is a banner that is always
 * there, and a banner that is always there is furniture rather than a signal. Collapsed,
 * it costs a line and still says the number; open, it is the same list as before.
 */
function AlertBanner({
  alerts,
  open,
  onToggle,
  onOpenQueue,
}: {
  alerts: OperatorAlert[];
  open: boolean;
  onToggle: () => void;
  onOpenQueue: () => void;
}) {
  const now = Date.now();
  // Nothing waiting is not news. The header counts already say the queue is quiet.
  if (alerts.length === 0) return null;

  return (
    <div className="admin-alerts">
      <button type="button" className="admin-alerts-summary" aria-expanded={open} onClick={onToggle}>
        <span className="admin-alerts-count">{alerts.length}</span>
        <span className="admin-alerts-gist">waiting on you — {summarize(alerts)}</span>
        <span className="admin-alerts-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <ul className="admin-alerts-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`admin-alert admin-alert--${alert.kind}`}>
              {/* The row is the way to the queue, which is the only place any of these can
                  actually be acted on. Before this it was inert text that told you
                  something was wrong and offered no verb. */}
              <button type="button" className="admin-alert-open" onClick={onOpenQueue}>
                <span className="admin-alert-title">{alert.title}</span>{' '}
                <span className="admin-alert-kind">
                  {ALERT_COPY[alert.kind]}
                  {alert.stall ? ` (${alert.stall})` : ''}
                </span>{' '}
                <span className="admin-alert-age">
                  {alert.jobId === undefined ? '' : `#${alert.jobId} · `}
                  {since(alert.since, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminConsole({ section, onNavigate }: { section: AdminSection; onNavigate: (path: string) => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  // Held here rather than in the banner so switching sections does not re-collapse a list
  // the operator just opened — the banner is the same banner on every section.
  const [alertsOpen, setAlertsOpen] = useState(false);

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
          // Discrete figures rather than one dot-separated sentence: these are four
          // unrelated numbers, and reading them as prose meant reading all of them to
          // find the one you came for.
          <dl className="admin-console-counts">
            <div>
              <dt>Active</dt>
              <dd>{summary.queue.active}</dd>
            </div>
            <div className={summary.queue.stalled > 0 ? 'is-warn' : undefined}>
              <dt>Stalled</dt>
              <dd>{summary.queue.stalled}</dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd>
                {summary.limits.todaySubmissions}
                <span className="admin-console-of">/{summary.limits.globalDailySubmissionCap}</span>
              </dd>
            </div>
            <div className={summary.limits.paused ? 'is-warn' : undefined}>
              <dt>Creation</dt>
              <dd>{summary.limits.paused ? 'paused' : 'open'}</dd>
            </div>
          </dl>
        )}
      </header>

      <nav className="admin-tabs" aria-label="Operator sections">
        {ADMIN_SECTIONS.map((candidate) => (
          // Real links, not buttons: these are addresses, so a middle-click or a
          // cmd-click should open one in a new tab the way it does everywhere else on
          // the site. The click handler is the in-app path, not the only path.
          <a
            key={candidate}
            href={adminPath(candidate)}
            className={candidate === section ? 'admin-tab is-active' : 'admin-tab'}
            aria-current={candidate === section ? 'page' : undefined}
            onClick={(event) => {
              if (event.defaultPrevented || event.button !== 0) return;
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigate(adminPath(candidate));
            }}
          >
            {SECTION_LABELS[candidate]}
            {candidate === 'queue' && summary && summary.alerts.length > 0 ? (
              <span className="admin-tab-badge" aria-label={`${summary.alerts.length} waiting on you`}>
                {summary.alerts.length}
              </span>
            ) : null}
            {/* The breaker being pulled is the other state that wants a person, and it
                is invisible from five of the six sections without this. */}
            {candidate === 'limits' && summary?.limits.paused ? (
              <span className="admin-tab-badge is-warn" aria-label="creation paused">
                paused
              </span>
            ) : null}
            {candidate === 'waitlist' && summary && summary.waitlist.pending > 0 ? (
              <span className="admin-tab-badge" aria-label={`${summary.waitlist.pending} waiting for access`}>
                {summary.waitlist.pending}
              </span>
            ) : null}
          </a>
        ))}
      </nav>

      {state === 'error' && <p className="health-empty">Could not read the console summary.</p>}
      {summary && (
        <AlertBanner
          alerts={summary.alerts}
          open={alertsOpen}
          onToggle={() => setAlertsOpen((wasOpen) => !wasOpen)}
          onOpenQueue={() => onNavigate(adminPath('queue'))}
        />
      )}

      {section === 'queue' && <AdminJobsPanel />}
      {section === 'costs' && <CostsPanel />}
      {section === 'telemetry' && <GameHealthView />}
      {section === 'limits' && <CreationLimitsPanel onChanged={() => void load()} />}
      {section === 'tokens' && <AccessTokensPanel />}
      {section === 'suggestions' && <SuggestionsPanel />}
      {section === 'proposals' && <ProposalReviewPanel scope="platform" />}
      {section === 'waitlist' && <WaitlistPanel />}
      {section === 'assessments' && <AdminAssessmentsPanel />}
    </section>
  );
}
