import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { latestAgentActivityAt } from '../../agentActivity.js';
import { BuildProgressChecklist } from '../../BuildProgressChecklist.js';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import type { SubmissionStatus } from '../../submissionApi.js';

// A build-shaped row for the round in progress, before any delivery.
export function StudioLiveRoundRow({ status, emptyLabel }: { status: SubmissionStatus; emptyLabel?: string }) {
  const { t, i18n } = useTranslation();
  // Starts open — no extra click needed to see it.
  const [expanded, setExpanded] = useState(true);
  const heartbeatAt = latestAgentActivityAt(status);
  const toggle = () => setExpanded((prev) => !prev);

  return (
    <li className={`studio-build-history-row is-pending${expanded ? ' is-expanded' : ''}`}>
      <div
        className="studio-build-history-summary"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={expanded}
        data-testid="studio-build-history-live-round"
      >
        <span className="studio-build-history-dot is-live" aria-hidden="true" />
        <span className="studio-build-history-mode">{t('studioPanel.buildBar.roundInProgress')}</span>
        <span className="studio-build-history-verdict" />
        {heartbeatAt != null ? (
          <time className="studio-build-history-time" dateTime={new Date(heartbeatAt).toISOString()}>
            {formatRelativeTime(heartbeatAt, i18n.language)}
          </time>
        ) : (
          <span />
        )}
        <span className="studio-build-history-expand-icon" aria-hidden="true">
          <PixelIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={10} />
        </span>
      </div>
      {expanded ? (
        <div className="studio-build-history-details" data-testid="build-details-live-round">
          <BuildProgressChecklist
            progress={status.progress ?? null}
            events={status.events ?? []}
            loaded
            emptyLabel={emptyLabel}
          />
        </div>
      ) : null}
    </li>
  );
}
