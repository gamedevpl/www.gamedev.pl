import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import {
  clampSheetDragHeight,
  nextSheetDetent,
  snapSheetDetent,
  type SheetDetent,
  SHEET_DRAG_CLICK_SLOP_PX,
  SHEET_PEEK_PX,
} from './studioChatSheet.js';

/**
 * B3/B4: a glass shell around the embedded `SubmissionStatusView` thread — the chat
 * rail on a desktop, a bottom sheet with three detents on a phone. One component, two
 * docks, per the "one layout" bet (Workstream B4).
 */

const SHEET_MAX_WIDTH = 800;
export type { SheetDetent };

export type StudioChatRailProps = {
  title: string;
  open: boolean;
  covered?: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  latestEntryLabel?: string | null;
  /** Whether the transcript body is actually visible right now — `open` alone is true
   * even at the phone sheet's `peek` detent, where the body is hidden behind a one-line
   * preview. The parent needs this distinction for unread accounting: peeking must not
   * count as having read what scrolled by. */
  onVisiblyOpenChange?: (visiblyOpen: boolean) => void;
  children: ReactNode;
};

export function StudioChatRail({
  title,
  open,
  covered = false,
  onOpenChange,
  unreadCount,
  latestEntryLabel,
  onVisiblyOpenChange,
  children,
}: StudioChatRailProps) {
  const { t } = useTranslation();
  const [isSheet, setIsSheet] = useState(false);
  const [detent, setDetent] = useState<SheetDetent>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    startH: number;
    moved: boolean;
    lastActivityAt: number;
  } | null>(null);
  const ignoreGrabClickRef = useRef(false);
  const visible = open && !covered;
  const peeking = isSheet && detent === 'peek' && dragHeight == null;

  // A collapsed rail stays mounted but is clipped to 1px via CSS, not
  // display:none — `aria-hidden` alone does not remove its buttons/textarea from the
  // tab order, so a keyboard user can otherwise land on invisible controls.
  // `inert` (imperative, since @types/react 18 doesn't type it as a JSX prop) removes
  // the whole collapsed subtree from both focus and the accessibility tree.
  useEffect(() => {
    const node = asideRef.current as (HTMLElement & { inert: boolean }) | null;
    if (node) node.inert = !visible;
  }, [visible]);

  useEffect(() => {
    const query =
      typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`) : null;
    const sync = () => setIsSheet(query ? query.matches : window.innerWidth <= SHEET_MAX_WIDTH);
    sync();
    query?.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      query?.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    if (open && isSheet) setDetent((current) => (current === 'peek' ? 'half' : current));
  }, [open, isSheet]);

  const visiblyOpen = visible && !peeking;
  const closeLabel = t('studioPanel.rail.closeThread', { defaultValue: 'Close chat' });
  const expandLabel = t('studioPanel.rail.fullScreen', { defaultValue: 'Full screen' });
  const exitFullLabel = t('studioPanel.rail.exitFullScreen', { defaultValue: 'Exit full screen' });
  useEffect(() => {
    onVisiblyOpenChange?.(visiblyOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblyOpen]);

  // The install/update banner pins to the bottom edge too (reflowed in-flow while a
  // game is open, see styles.css around `.studio-layout.is-game-open .install-prompt`)
  // — without this, the viewport-fixed sheet paints over its dismiss/reload controls
  // instead of sitting above them.
  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const header = document.querySelector('.app-header') as HTMLElement | null;
      if (header) {
        const headerBottom = Math.max(0, Math.ceil(header.getBoundingClientRect().bottom));
        root.style.setProperty('--studio-chat-rail-top-inset', `${headerBottom}px`);
      } else {
        root.style.removeProperty('--studio-chat-rail-top-inset');
      }
      const overlay = document.querySelector('.install-prompt, .app-update') as HTMLElement | null;
      if (!overlay) {
        root.style.removeProperty('--studio-chat-rail-overlay-lift');
        return;
      }
      const top = overlay.getBoundingClientRect().top;
      const lift = Math.max(0, Math.ceil(window.innerHeight - top + 8));
      root.style.setProperty('--studio-chat-rail-overlay-lift', `${lift}px`);
    };
    measure();
    let resizeObserver: ResizeObserver | null = null;
    const watchOverlays = () => {
      resizeObserver?.disconnect();
      document.querySelectorAll('.install-prompt, .app-update, .app-header').forEach((node) => {
        resizeObserver?.observe(node);
      });
      measure();
    };
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      watchOverlays();
    }
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(watchOverlays);
    mutationObserver?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--studio-chat-rail-overlay-lift');
      root.style.removeProperty('--studio-chat-rail-top-inset');
    };
  }, []);

  // No setPointerCapture — iOS WebKit can leak it and lock touch app-wide.
  const onGrabPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isSheet || event.button !== 0) return;
    const rail = asideRef.current;
    if (!rail) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startH: rail.getBoundingClientRect().height,
      moved: false,
      lastActivityAt: Date.now(),
    };
  };

  useEffect(() => {
    if (!isSheet) return;
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.lastY = event.clientY;
      drag.lastActivityAt = Date.now();
      const dy = drag.startY - event.clientY;
      if (!drag.moved && Math.abs(dy) < SHEET_DRAG_CLICK_SLOP_PX) return;
      drag.moved = true;
      setDragHeight(clampSheetDragHeight(drag.startH + dy, window.innerHeight));
    };
    const onEnd = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (!drag.moved) return;
      ignoreGrabClickRef.current = true;
      const height = clampSheetDragHeight(drag.startH + drag.startY - event.clientY, window.innerHeight);
      setDetent(snapSheetDetent(height, window.innerHeight));
      setDragHeight(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    // Backstop for a dropped pointerup: release a drag gone quiet.
    const STUCK_DRAG_IDLE_MS = 4000;
    const watchdog = window.setInterval(() => {
      const drag = dragRef.current;
      if (!drag || Date.now() - drag.lastActivityAt < STUCK_DRAG_IDLE_MS) return;
      dragRef.current = null;
      if (drag.moved) {
        const height = clampSheetDragHeight(drag.startH + (drag.startY - drag.lastY), window.innerHeight);
        setDetent(snapSheetDetent(height, window.innerHeight));
        setDragHeight(null);
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.clearInterval(watchdog);
      dragRef.current = null;
    };
  }, [isSheet]);

  const onGrabClick = () => {
    if (ignoreGrabClickRef.current) {
      ignoreGrabClickRef.current = false;
      return;
    }
    setDetent(nextSheetDetent(detent));
  };

  const dragging = dragHeight != null;
  const detentClass = isSheet ? ` is-sheet is-${detent}${dragging ? ' is-dragging' : ''}` : '';
  const sheetStyle = isSheet
    ? ({
        '--studio-chat-rail-peek-height': `${SHEET_PEEK_PX}px`,
        ...(dragging ? { '--studio-chat-rail-drag-height': `${dragHeight}px` } : {}),
      } as CSSProperties)
    : undefined;

  // The thread stays mounted whether collapsed, peeking, or fully open — a collapse
  // must never unmount `SubmissionStatusView` (its poll and unsent composer text would
  // be lost). The aside + children remain present and are hidden via CSS.
  return (
    <>
      {visible && isSheet && !peeking ? (
        <div
          className="modal-backdrop studio-chat-rail-backdrop"
          role="presentation"
          onClick={() => setDetent('peek')}
        />
      ) : null}
      <aside
        ref={asideRef}
        className={`studio-chat-rail${detentClass}${visible ? '' : ' is-collapsed'}`}
        style={sheetStyle}
        aria-label={title}
        aria-hidden={visible ? undefined : true}
        {...(visible && isSheet && !peeking ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        {open && isSheet ? (
          <button
            type="button"
            className="studio-chat-rail-grab"
            onPointerDown={onGrabPointerDown}
            onClick={onGrabClick}
            aria-label={
              detent === 'full'
                ? t('studioPanel.rail.collapse', { defaultValue: 'Collapse' })
                : t('studioPanel.rail.expand', { defaultValue: 'Expand' })
            }
          >
            <span className="studio-chat-rail-grab-bar" aria-hidden="true" />
          </button>
        ) : null}
        <div className="studio-chat-rail-head">
          <h3 className="studio-chat-rail-title">{title}</h3>
          <div className="studio-chat-rail-head-actions">
            {open && isSheet ? (
              <button
                type="button"
                className="studio-chat-rail-head-action studio-chat-rail-expand"
                onClick={() => setDetent(detent === 'full' ? 'half' : 'full')}
                aria-pressed={detent === 'full'}
                aria-label={detent === 'full' ? exitFullLabel : expandLabel}
                data-tooltip={detent === 'full' ? exitFullLabel : expandLabel}
              >
                <PixelIcon name={detent === 'full' ? 'collapse' : 'expand'} size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="studio-chat-rail-head-action studio-chat-rail-close"
              onClick={() => onOpenChange(false)}
              aria-label={closeLabel}
              data-tooltip={closeLabel}
            >
              <PixelIcon name="close" size={14} />
            </button>
          </div>
        </div>

        {open && isSheet && peeking ? (
          <button type="button" className="studio-chat-rail-peek" onClick={() => setDetent('half')}>
            <span className="studio-chat-rail-peek-line">
              {latestEntryLabel ?? t('studioPanel.rail.peekEmpty', { defaultValue: 'No updates yet' })}
            </span>
            {unreadCount > 0 ? (
              <span className="studio-chat-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : null}
          </button>
        ) : null}
        <div className="studio-chat-rail-body" hidden={open && isSheet && peeking}>
          {children}
        </div>
      </aside>
    </>
  );
}
