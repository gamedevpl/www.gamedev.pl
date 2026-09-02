import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { BuildHeartbeat } from './BuildHeartbeat.js';
import { PRESENCE_THOUGHT_MS } from './presenceThought.js';

// The bar between the thread and the composer: where the work is.
export function ThreadContextBar({
  phase,
  thought,
  heartbeatAt,
  progress,
  primary,
  active = false,
}: {
  phase: string;
  // Fresh MCP presence thought — a short headline flash over the phase.
  thought?: { key: string; at: number } | null;
  heartbeatAt: number | null;
  progress?: { done: number; total: number };
  primary?: { label: string; onClick: () => void };
  // Mid-build motion — a fixed phase would read as stuck.
  active?: boolean;
}) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);

  const thoughtAt = thought?.at ?? null;

  // One timeout at expiry so the headline falls back without a poll.
  useEffect(() => {
    if (thoughtAt === null) return;
    const remaining = thoughtAt + PRESENCE_THOUGHT_MS - Date.now();
    if (remaining <= 0) {
      setTick((n) => n + 1);
      return;
    }
    const id = window.setTimeout(() => setTick((n) => n + 1), remaining);
    return () => window.clearTimeout(id);
  }, [thoughtAt]);

  const thoughtFresh = thought !== null && thought !== undefined && Date.now() - thought.at <= PRESENCE_THOUGHT_MS;
  const thoughtLabel =
    thoughtFresh && thought
      ? t(`statusView.presence.${thought.key}`, {
          defaultValue: '',
        })
      : '';
  const headline = thoughtLabel || phase;
  const showingThought = Boolean(thoughtLabel);

  return (
    <div className={`studio-thread-context${active ? ' is-active' : ''}${showingThought ? ' is-thought' : ''}`}>
      <span className="studio-context-state">
        <span
          className="studio-context-phase"
          key={showingThought ? `thought:${thought!.key}:${thought!.at}` : `phase:${phase}`}
        >
          {active ? <span className="studio-context-phase-spinner" aria-hidden="true" /> : null}
          {headline}
        </span>
        {heartbeatAt !== null ? (
          <span className="studio-context-beat">
            <BuildHeartbeat at={heartbeatAt} />
          </span>
        ) : null}
      </span>
      <span className="studio-context-actions">
        {progress && progress.total > 0 ? (
          <span className="studio-context-progress">
            {t('statusView.progress.checklistCount', { done: progress.done, total: progress.total })}
          </span>
        ) : null}
        {primary ? (
          <button type="button" className="primary-btn status-play-cta" onClick={primary.onClick}>
            <PixelIcon name="play" size={13} /> {primary.label}
          </button>
        ) : null}
      </span>
    </div>
  );
}
