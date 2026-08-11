import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';

/**
 * B3/B4: a glass shell around the embedded `SubmissionStatusView` thread — the chat
 * rail on a desktop, a bottom sheet with three detents on a phone. One component, two
 * docks, per the "one layout" bet (Workstream B4).
 */

const SHEET_MAX_WIDTH = 800;
export type SheetDetent = 'peek' | 'half' | 'full';

export type StudioChatRailProps = {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  standaloneHref?: string;
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
  onOpenChange,
  unreadCount,
  standaloneHref,
  latestEntryLabel,
  onVisiblyOpenChange,
  children,
}: StudioChatRailProps) {
  const { t } = useTranslation();
  const [isSheet, setIsSheet] = useState(false);
  const [detent, setDetent] = useState<SheetDetent>('half');
  const asideRef = useRef<HTMLElement | null>(null);

  // A collapsed rail stays mounted but is clipped to 1px via CSS, not
  // display:none — `aria-hidden` alone does not remove its buttons/textarea from the
  // tab order, so a keyboard user can otherwise land on invisible controls.
  // `inert` (imperative, since @types/react 18 doesn't type it as a JSX prop) removes
  // the whole collapsed subtree from both focus and the accessibility tree.
  useEffect(() => {
    const node = asideRef.current as (HTMLElement & { inert: boolean }) | null;
    if (node) node.inert = !open;
  }, [open]);

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

  const visiblyOpen = open && !(isSheet && detent === 'peek');
  const popOutLabel = t('studioPanel.rail.popOut', { defaultValue: 'Open as page' });
  const closeLabel = t('studioPanel.rail.closeThread', { defaultValue: 'Close chat' });
  useEffect(() => {
    onVisiblyOpenChange?.(visiblyOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblyOpen]);

  // The install/update banner pins to the bottom edge too (reflowed in-flow while a
  // game is open, see styles.css around `.studio-layout.is-game-open .install-prompt`)
  // — without this, the viewport-fixed sheet paints over its dismiss/reload controls
  // instead of sitting above them. Same measured-lift pattern as ReviewDesk's sticky dock.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const measure = () => {
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
    const resizeObserver = new ResizeObserver(measure);
    const watchOverlays = () => {
      resizeObserver.disconnect();
      document.querySelectorAll('.install-prompt, .app-update').forEach((node) => resizeObserver.observe(node));
      measure();
    };
    watchOverlays();
    const mutationObserver = new MutationObserver(watchOverlays);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--studio-chat-rail-overlay-lift');
    };
  }, []);

  const detentClass = isSheet ? ` is-sheet is-${detent}` : '';

  // The thread stays mounted whether collapsed, peeking, or fully open — a collapse
  // must never unmount `SubmissionStatusView` (its poll and unsent composer text would
  // be lost). The aside + children remain present and are hidden via CSS.
  return (
    <>
      {open && isSheet && detent !== 'peek' ? (
        <div
          className="modal-backdrop studio-chat-rail-backdrop"
          role="presentation"
          onClick={() => setDetent('peek')}
        />
      ) : null}
      <aside
        ref={asideRef}
        className={`studio-chat-rail${detentClass}${open ? '' : ' is-collapsed'}`}
        aria-label={title}
        aria-hidden={open ? undefined : true}
        {...(open && isSheet && detent !== 'peek' ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className="studio-chat-rail-head">
          {open && isSheet ? (
            <button
              type="button"
              className="studio-chat-rail-grab"
              // Cycles peek -> half -> full -> peek — the only way to reach `full`
              // (and its `.is-full` CSS) short of a drag gesture this sheet doesn't
              // implement.
              onClick={() => setDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek')}
              aria-label={
                detent === 'full'
                  ? t('studioPanel.rail.collapse', { defaultValue: 'Collapse' })
                  : t('studioPanel.rail.expand', { defaultValue: 'Expand' })
              }
            >
              <span className="studio-chat-rail-grab-bar" aria-hidden="true" />
            </button>
          ) : null}
          <h3 className="studio-chat-rail-title">{title}</h3>
          <div className="studio-chat-rail-head-actions">
            {standaloneHref ? (
              <a
                className="studio-chat-rail-head-action studio-chat-rail-popout"
                href={standaloneHref}
                aria-label={popOutLabel}
                data-tooltip={popOutLabel}
              >
                <PixelIcon name="expand" size={14} />
              </a>
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

        {open && isSheet && detent === 'peek' ? (
          <button type="button" className="studio-chat-rail-peek" onClick={() => setDetent('half')}>
            <span className="studio-chat-rail-peek-line">
              {latestEntryLabel ?? t('studioPanel.rail.peekEmpty', { defaultValue: 'No updates yet' })}
            </span>
            {unreadCount > 0 ? (
              <span className="studio-chat-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : null}
          </button>
        ) : null}
        <div className="studio-chat-rail-body" hidden={open && isSheet && detent === 'peek'}>
          {children}
        </div>
      </aside>
    </>
  );
}
