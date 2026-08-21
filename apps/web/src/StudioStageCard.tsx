import { useTranslation } from 'react-i18next';
import { latestAgentActivityAt } from './agentActivity.js';
import { Mascot } from './Mascot.js';
import { formatRelativeTime } from './relativeTime.js';
import type { SubmissionStatus } from './submissionApi.js';

// What the stage says while nothing playable has landed on it (Workstream C).
export function StudioStageCard({ status }: { status?: SubmissionStatus | null }) {
  const { t, i18n } = useTranslation();

  const gate = status?.gateProgress ?? null;
  const latestEvent = status?.events?.[0] ?? null;
  const checklist = status?.progress?.checklist ?? [];
  const reported = status?.events?.find((event) => event.progress)?.progress;
  const done = reported?.done ?? checklist.filter((item) => item.checked).length;
  const total = reported?.total ?? checklist.length;
  // Gate's own timestamp beats a stale pre-delivery agent line.
  const heartbeatAt = gate ? Date.parse(gate.at) || latestAgentActivityAt(status) : latestAgentActivityAt(status);
  // Not ended while our gate still owes a verdict — that window said "no version".
  const awaitingGate = status?.phase === 'submitted' || status?.phase === 'gating';
  const ended = !awaitingGate && (status?.stall === 'ended' || Boolean(status?.agentEndedAt));

  // Gate outranks the agent's last line: mid-check, that line is already history.
  const working = gate
    ? {
        kicker: t('studioPanel.stage.checkingKicker'),
        text: t(`statusView.gateProgress.${gate.stage}`, { defaultValue: t('statusView.phases.gating') }),
      }
    : awaitingGate
      ? { kicker: t('studioPanel.stage.checkingKicker'), text: t('studioPanel.buildBar.starting') }
      : latestEvent
        ? {
            kicker: latestEvent.step
              ? t(`statusView.progress.steps.${latestEvent.step}`)
              : t('statusView.progress.agentSays'),
            text: latestEvent.text,
          }
        : status?.progress?.note
          ? { kicker: t('statusView.progress.agentSays'), text: status.progress.note }
          : null;

  const title =
    gate || awaitingGate
      ? t('studioPanel.stage.checkingTitle')
      : ended
        ? t('studioPanel.stage.endedTitle')
        : t('studioPanel.stage.assembling');

  // `statusView.stall.*` says "reply below"; the thread is beside this card, not below.
  const stall = status?.stall && !gate && !awaitingGate ? status.stall : null;
  const hint = stall
    ? t(`studioPanel.stage.stall.${stall}`, { defaultValue: t(`statusView.stall.${stall}`) })
    : working
      ? null
      : t('studioPanel.stage.assemblingHint');

  return (
    <div className="studio-stage-card is-assembling" role="status" aria-live="polite">
      <Mascot emotion="busy" size={72} cooking title={t('mascot.busyAlt')} />
      <p className="studio-stage-card-title">{title}</p>

      {working ? (
        <p className="studio-stage-card-working">
          <span className="studio-stage-card-kicker">{working.kicker}</span>
          <span className="studio-stage-card-working-text">{working.text}</span>
        </p>
      ) : null}

      {total > 0 ? (
        <div className="studio-stage-card-progress">
          <div
            className="build-progress-bar"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <div className="build-progress-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="studio-stage-card-count">{t('statusView.progress.checklistCount', { done, total })}</span>
        </div>
      ) : null}

      {heartbeatAt != null ? (
        // Ticks every poll; announcing "updated 2 minutes ago" that often is noise.
        <p className="studio-stage-card-heartbeat" aria-live="off">
          {t('statusView.updatedAgo', { time: formatRelativeTime(heartbeatAt, i18n.language) })}
        </p>
      ) : null}

      {hint ? <p className="studio-stage-card-detail">{hint}</p> : null}
    </div>
  );
}
