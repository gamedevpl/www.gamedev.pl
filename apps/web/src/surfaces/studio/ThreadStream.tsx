import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buildMediaUrl, type BuildMediaItem, type PriorRoundHistory } from '../../submissionApi.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { studioThreadContentScrollTop, studioThreadNearContentEnd } from './studioThreadScroll.js';
import { StudioPriorRounds } from './StudioPriorRounds.js';
import { BuildHeartbeat } from './BuildHeartbeat.js';
import { PRESENCE_THOUGHT_MS } from './presenceThought.js';
import { ShotLightbox } from './ShotLightbox.js';
import type { ActivityEntry } from './buildActivityFeed.js';

export type ThreadWorkingState = {
  // Coarse phase — "Writing code" / "Starting agent".
  label: string;
  // Fresh ambient presence thought, when one is flashing.
  thoughtLabel: string | null;
  thoughtKey: string | null;
  thoughtAt: number | null;
  heartbeatAt: number | null;
};

// Agent turns are prose; the creator's turns are quiet bubbles.
export function ThreadStream({
  token,
  entries,
  emptyLabel,
  priorRounds,
  priorSlug,
  after,
  working = null,
  stickNonce = 0,
}: {
  token: string;
  entries: ActivityEntry[];
  emptyLabel: string;
  // Superseded jobs on this game — collapsed above the live turns.
  priorRounds?: PriorRoundHistory[];
  priorSlug?: string;
  // Renders after the turns — tall surfaces (connect card) belong here.
  after?: ReactNode;
  // Live agent work; the last transcript row, cleared once inactive.
  working?: ThreadWorkingState | null;
  // Bump when `after`/`working` appears, for a stuck-to-bottom reader.
  stickNonce?: number;
}) {
  const { t, i18n } = useTranslation();
  const [zoomed, setZoomed] = useState<BuildMediaItem | null>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [, setThoughtTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const onScroll = () => {
    const pane = scrollRef.current;
    if (!pane) return;
    // Content end, not the runway pad.
    stickToBottomRef.current = studioThreadNearContentEnd(pane);
  };

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || !stickToBottomRef.current) return;
    // Do not scroll into the Claude/Cursor runway.
    pane.scrollTop = studioThreadContentScrollTop(pane);
  }, [entries.length, stickNonce, working?.label, working?.thoughtLabel]);

  // One timeout at expiry — no poll needed.
  useEffect(() => {
    if (!working?.thoughtAt || !working.thoughtLabel) return;
    const remaining = working.thoughtAt + PRESENCE_THOUGHT_MS - Date.now();
    if (remaining <= 0) {
      setThoughtTick((n) => n + 1);
      return;
    }
    const id = window.setTimeout(() => setThoughtTick((n) => n + 1), remaining);
    return () => window.clearTimeout(id);
  }, [working?.thoughtAt, working?.thoughtLabel]);

  const thoughtFresh =
    working?.thoughtAt != null &&
    working.thoughtLabel != null &&
    working.thoughtLabel.length > 0 &&
    Date.now() - working.thoughtAt <= PRESENCE_THOUGHT_MS;
  const workingHeadline = thoughtFresh && working?.thoughtLabel ? working.thoughtLabel : working?.label;

  return (
    <div className="studio-thread-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="studio-thread-scroll-body">
        {priorSlug && priorRounds && priorRounds.length > 0 ? (
          <StudioPriorRounds slug={priorSlug} rounds={priorRounds} />
        ) : null}
        {entries.length === 0 && !working ? <p className="studio-thread-empty">{emptyLabel}</p> : null}
        <ol className="studio-thread-turns">
          {entries.map((entry, index) => {
            const mine = entry.kind === 'revision';
            const isStudioVoice = entry.kind === 'studio';
            const media = entry.media?.filter((item) => !broken.includes(item.ref)) ?? [];
            return (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className={`studio-turn${mine ? ' is-mine' : ''}${isStudioVoice ? ' is-studio-voice' : ''}${entry.pending ? ' is-pending' : ''}`}
              >
                <div className="studio-turn-body">
                  {!mine && entry.step ? (
                    <span className="studio-turn-kicker">{t(`statusView.progress.steps.${entry.step}`)}</span>
                  ) : null}
                  {mine && entry.relayed ? (
                    <span className="studio-turn-kicker">{t('statusView.progress.relayedRequest')}</span>
                  ) : null}
                  {entry.kind === 'studio' ? (
                    <span className="studio-turn-kicker studio-turn-kicker-studio">
                      {t('statusView.progress.studioVoice')}
                    </span>
                  ) : null}
                  <p className="studio-turn-text">{entry.text}</p>
                  {media.length > 0 ? (
                    <span className="studio-turn-shots">
                      {media.map((item) => (
                        <button
                          key={item.ref}
                          type="button"
                          className="build-activity-shot"
                          onClick={() => setZoomed(item)}
                          title={t('statusView.gallery.expand')}
                        >
                          <img
                            src={buildMediaUrl(token, item)}
                            alt={item.label || t('statusView.gallery.alt')}
                            loading="lazy"
                            onError={() => setBroken((refs) => (refs.includes(item.ref) ? refs : [...refs, item.ref]))}
                          />
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
                <time className="studio-turn-time" dateTime={new Date(entry.at).toISOString()}>
                  {entry.pending ? (
                    t('statusView.progress.yourRequestSending')
                  ) : mine && entry.delivered !== undefined ? (
                    <>
                      <span className={`studio-turn-delivery${entry.delivered ? ' is-delivered' : ' is-queued'}`}>
                        {t(
                          entry.delivered
                            ? 'statusView.progress.yourRequestDelivered'
                            : 'statusView.progress.yourRequestQueued',
                        )}
                      </span>
                      {' · '}
                      {formatRelativeTime(entry.at, i18n.language)}
                    </>
                  ) : (
                    formatRelativeTime(entry.at, i18n.language)
                  )}
                </time>
              </li>
            );
          })}
          {working && workingHeadline ? (
            <li className={`studio-turn is-working${thoughtFresh ? ' is-thought' : ''}`} aria-live="polite">
              <div
                className="studio-turn-working"
                key={
                  thoughtFresh && working.thoughtKey
                    ? `thought:${working.thoughtKey}:${working.thoughtAt}`
                    : `phase:${working.label}`
                }
              >
                <span className="studio-turn-working-pulse" aria-hidden="true" />
                <span className="studio-turn-working-label">{workingHeadline}</span>
              </div>
              {working.heartbeatAt !== null ? (
                <span className="studio-turn-time">
                  <BuildHeartbeat at={working.heartbeatAt} />
                </span>
              ) : null}
            </li>
          ) : null}
        </ol>
        {after}
      </div>
      <div className="studio-thread-scroll-pad" aria-hidden="true" />
      {zoomed ? <ShotLightbox token={token} item={zoomed} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}
