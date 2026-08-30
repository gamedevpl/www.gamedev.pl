import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { buildMediaUrl, type BuildMediaItem } from '../../submissionApi.js';
import { subscribeStudioStatus } from './studioStatusStore.js';

/**
 * Scattered screenshot stack near Play — a dismissable notification.
 * Click opens Details → Media (the durable layout). Drag nudges position,
 * clamped so the stack cannot leave the studio detail bounds.
 */

const MAX_VISIBLE = 3;
const POLL_MS = 12_000;
const DRAG_THRESHOLD_PX = 5;
/** Keep at least this many pixels of the stack inside the detail panel. */
const MIN_VISIBLE_PX = 48;

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

function clampOffsetToParent(el: HTMLElement, offset: { x: number; y: number }): { x: number; y: number } {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return offset;

  const parentRect = parent.getBoundingClientRect();
  // Measure as if at the candidate offset (current style may already include it).
  const prev = el.style.transform;
  el.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  const rect = el.getBoundingClientRect();
  el.style.transform = prev;

  let { x, y } = offset;
  if (rect.right < parentRect.left + MIN_VISIBLE_PX) {
    x += parentRect.left + MIN_VISIBLE_PX - rect.right;
  } else if (rect.left > parentRect.right - MIN_VISIBLE_PX) {
    x += parentRect.right - MIN_VISIBLE_PX - rect.left;
  }
  if (rect.bottom < parentRect.top + MIN_VISIBLE_PX) {
    y += parentRect.top + MIN_VISIBLE_PX - rect.bottom;
  } else if (rect.top > parentRect.bottom - MIN_VISIBLE_PX) {
    y += parentRect.bottom - MIN_VISIBLE_PX - rect.top;
  }
  return { x, y };
}

export type StudioShotToastsPlacement = 'bottom-right' | 'near-play';

type StudioShotToastsProps = {
  token: string;
  /** Where the collapsed stack sits inside `.studio-detail`. */
  placement?: StudioShotToastsPlacement;
  /** Opens Details → Media — the durable home for screenshots. */
  onOpenMedia?: () => void;
};

type DragOrigin = {
  pointerId: number;
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
  moved: boolean;
};

export function StudioShotToasts({ token, placement = 'near-play', onOpenMedia }: StudioShotToastsProps) {
  const { t, i18n } = useTranslation();
  const [media, setMedia] = useState<BuildMediaItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<DragOrigin | null>(null);
  const suppressClickRef = useRef(false);
  const stackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeStudioStatus(
      token,
      i18n.language,
      {
        intervalMs: () => POLL_MS,
        onUpdate: (status) => setMedia(status.media ?? []),
        onError: () => setMedia([]),
      },
      { forceFreshOnMount: true },
    );
  }, [token, i18n.language]);

  useEffect(() => {
    setDismissed(new Set());
    setOffset({ x: 0, y: 0 });
  }, [token]);

  useEffect(() => {
    const onResize = () => {
      const el = stackRef.current;
      if (!el) return;
      setOffset((current) => clampOffsetToParent(el, current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const visible = useMemo(() => {
    return media
      .filter((item) => {
        const key = `${item.source}:${item.ref}`;
        if (dismissed.has(key)) return false;
        return !isDismissed(token, item);
      })
      .slice(0, MAX_VISIBLE);
  }, [media, dismissed, token]);

  const openMedia = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenMedia?.();
  };

  const onStackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    const next = { x: drag.originOffsetX + dx, y: drag.originOffsetY + dy };
    const el = stackRef.current;
    setOffset(el ? clampOffsetToParent(el, next) : next);
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
    if (drag.moved) {
      suppressClickRef.current = true;
      const el = stackRef.current;
      if (el) setOffset((current) => clampOffsetToParent(el, current));
    }
  };

  if (visible.length === 0) return null;

  return (
    <div
      ref={stackRef}
      data-testid="studio-shot-toasts"
      className={`studio-shot-toasts is-${placement} is-collapsed`}
      role="region"
      aria-label={t('studioPanel.preview.media')}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={onStackPointerDown}
      onPointerMove={onStackPointerMove}
      onPointerUp={onStackPointerUp}
      onPointerCancel={onStackPointerUp}
      onClick={openMedia}
    >
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
                  openMedia();
                }}
                aria-label={t('studioPanel.preview.expandShots')}
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
  );
}
