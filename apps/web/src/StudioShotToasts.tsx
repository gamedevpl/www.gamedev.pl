import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { buildMediaUrl, getSubmissionStatus, type BuildMediaItem } from './submissionApi.js';

/**
 * Scattered screenshot stack near Play. Click expands into a comfortable
 * grid; click a shot in the grid opens the lightbox. The collapsed stack
 * can be dragged to nudge its position. Pause stays in playtest theater.
 */

const MAX_VISIBLE = 3;
const POLL_MS = 12_000;
const DRAG_THRESHOLD_PX = 5;

function dismissKey(token: string, item: BuildMediaItem): string {
  return `studio-shot-dismiss:${token}:${item.source}:${item.ref}`;
}

function isDismissed(token: string, item: BuildMediaItem): boolean {
  try {
    return sessionStorage.getItem(dismissKey(token, item)) === '1';
  } catch {
    return false;
  }
}

function markDismissed(token: string, item: BuildMediaItem): void {
  try {
    sessionStorage.setItem(dismissKey(token, item), '1');
  } catch {
    /* private mode — dismiss is session-memory only via React state */
  }
}

export type StudioShotToastsPlacement = 'bottom-right' | 'near-play';

type StudioShotToastsProps = {
  token: string;
  /** Where the collapsed stack sits inside `.studio-detail`. */
  placement?: StudioShotToastsPlacement;
};

type DragOrigin = {
  pointerId: number;
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
  moved: boolean;
};

export function StudioShotToasts({ token, placement = 'near-play' }: StudioShotToastsProps) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<BuildMediaItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<DragOrigin | null>(null);
  const suppressClickRef = useRef(false);
  const stackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getSubmissionStatus(token)
        .then((status) => {
          if (!cancelled) setMedia(status.media ?? []);
        })
        .catch(() => {
          if (!cancelled) setMedia([]);
        });
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    setDismissed(new Set());
    setExpanded(false);
    setOffset({ x: 0, y: 0 });
  }, [token]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, lightbox]);

  const visible = useMemo(() => {
    return media
      .filter((item) => {
        const key = `${item.source}:${item.ref}`;
        if (dismissed.has(key)) return false;
        return !isDismissed(token, item);
      })
      .slice(0, MAX_VISIBLE);
  }, [media, dismissed, token]);

  const onStackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (expanded) return;
    if ((event.target as HTMLElement).closest('.studio-shot-toast-dismiss')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffsetX: offset.x,
      originOffsetY: offset.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onStackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    setOffset({ x: drag.originOffsetX + dx, y: drag.originOffsetY + dy });
  };

  const onStackPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* already released */
    }
    if (drag.moved) suppressClickRef.current = true;
  };

  const expandFromCollapsed = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!expanded) setExpanded(true);
  };

  if (visible.length === 0 && !lightbox) return null;

  return (
    <>
      <div
        ref={stackRef}
        data-testid="studio-shot-toasts"
        className={`studio-shot-toasts is-${placement}${expanded ? ' is-expanded' : ' is-collapsed'}`}
        role="region"
        aria-label={t('studioPanel.preview.media')}
        aria-expanded={expanded}
        style={
          expanded
            ? undefined
            : {
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }
        }
        onPointerDown={onStackPointerDown}
        onPointerMove={onStackPointerMove}
        onPointerUp={onStackPointerUp}
        onPointerCancel={onStackPointerUp}
        onClick={expanded ? undefined : expandFromCollapsed}
      >
        {expanded ? (
          <div className="studio-shot-toasts-toolbar">
            <span className="studio-shot-toasts-toolbar-title">{t('studioPanel.preview.media')}</span>
            <button
              type="button"
              className="studio-shot-toasts-collapse"
              onClick={() => setExpanded(false)}
              aria-label={t('studioPanel.preview.collapseShots')}
            >
              <PixelIcon name="collapse" size={12} />
              <span>{t('studioPanel.preview.collapseShots')}</span>
            </button>
          </div>
        ) : null}

        <div className="studio-shot-toasts-cards">
          {visible.map((item, index) => {
            const src = buildMediaUrl(token, item);
            const key = `${item.source}:${item.ref}`;
            const label = item.label?.trim() || t('studioPanel.preview.shot');
            return (
              <div key={key} className={`studio-shot-toast is-slot-${index}`} style={{ zIndex: MAX_VISIBLE - index }}>
                <button
                  type="button"
                  className="studio-shot-toast-body"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (!expanded) {
                      setExpanded(true);
                      return;
                    }
                    setLightbox(src);
                  }}
                  aria-label={expanded ? label : t('studioPanel.preview.expandShots')}
                >
                  <img src={src} alt="" loading="lazy" draggable={false} />
                  <span className="studio-shot-toast-caption">{label}</span>
                </button>
                <button
                  type="button"
                  className="studio-shot-toast-dismiss"
                  aria-label={t('studioPanel.preview.dismissShot')}
                  onClick={(event) => {
                    event.stopPropagation();
                    markDismissed(token, item);
                    setDismissed((prev) => new Set(prev).add(key));
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <PixelIcon name="close" size={10} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {lightbox ? (
        <button
          type="button"
          className="studio-shot-lightbox"
          onClick={() => setLightbox(null)}
          aria-label={t('studioPanel.preview.closeShot')}
        >
          <img src={lightbox} alt="" />
        </button>
      ) : null}
    </>
  );
}
