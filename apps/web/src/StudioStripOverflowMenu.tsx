import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';

export type StudioStripOverflowMenuProps = {
  codeAvailable: boolean;
  codeActive: boolean;
  onToggleCode: () => void;
  editAvailable: boolean;
  editActive: boolean;
  onToggleEdit: () => void;
  canClaim: boolean;
  onClaim: () => void;
  stageEmpty: boolean;
  onOpenTheater?: () => void;
  shareSlot?: ReactNode;
  detailsActive: boolean;
  onToggleDetails: () => void;
  threadOpen: boolean;
  onToggleThread: () => void;
  threadUnreadCount: number;
  onOpenChange?: (open: boolean) => void;
};

export function StudioStripOverflowMenu({
  codeAvailable,
  codeActive,
  onToggleCode,
  editAvailable,
  editActive,
  onToggleEdit,
  canClaim,
  onClaim,
  stageEmpty,
  onOpenTheater,
  shareSlot,
  detailsActive,
  onToggleDetails,
  threadOpen,
  onToggleThread,
  threadUnreadCount,
  onOpenChange,
}: StudioStripOverflowMenuProps) {
  const { t } = useTranslation();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onOpenChange?.(overflowOpen);
  }, [overflowOpen, onOpenChange]);

  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOverflowOpen(false);
        overflowTriggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (overflowRef.current?.contains(event.target as Node)) return;
      setOverflowOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [overflowOpen]);

  return (
    <div className="studio-head-menu" ref={overflowRef}>
      <button
        type="button"
        ref={overflowTriggerRef}
        className={`studio-head-action is-icon-only${overflowOpen ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={overflowOpen}
        aria-label={t('studioPanel.strip.moreActions')}
        onClick={() => setOverflowOpen((open) => !open)}
      >
        <PixelIcon name="menu" size={12} />{' '}
        <span className="studio-head-action-label">{t('studioPanel.strip.moreActions')}</span>
      </button>
      {overflowOpen ? (
        <div className="studio-head-menu-popover" role="menu" aria-label={t('studioPanel.strip.moreActions')}>
          {codeAvailable ? (
            <button
              type="button"
              role="menuitem"
              className={`studio-head-menu-item${codeActive ? ' is-active' : ''}`}
              aria-pressed={codeActive}
              onClick={() => {
                setOverflowOpen(false);
                onToggleCode();
              }}
            >
              <PixelIcon name="code" size={14} />
              <span>{t('studioPanel.tabs.code')}</span>
            </button>
          ) : null}

          {editAvailable ? (
            <button
              type="button"
              role="menuitem"
              className={`studio-head-menu-item${editActive ? ' is-active' : ''}`}
              aria-pressed={editActive}
              onClick={() => {
                setOverflowOpen(false);
                onToggleEdit();
              }}
            >
              <PixelIcon name="pencil" size={14} />
              <span>{t('studioPanel.tabs.edit')}</span>
            </button>
          ) : null}

          {canClaim ? (
            <button
              type="button"
              role="menuitem"
              className="studio-head-menu-item"
              onClick={() => {
                setOverflowOpen(false);
                onClaim();
              }}
            >
              <PixelIcon name="sparkle" size={14} />
              <span>{t('creatorProfile.publishGateTitle')}</span>
            </button>
          ) : null}

          {onOpenTheater ? (
            <button
              type="button"
              role="menuitem"
              className="studio-head-menu-item"
              disabled={stageEmpty}
              onClick={() => {
                setOverflowOpen(false);
                onOpenTheater();
              }}
            >
              <PixelIcon name="gamepad" size={14} />
              <span>{t('studioPanel.stage.openTheater')}</span>
            </button>
          ) : null}

          {shareSlot}

          <button
            type="button"
            role="menuitem"
            className={`studio-head-menu-item${detailsActive ? ' is-active' : ''}`}
            aria-pressed={detailsActive}
            onClick={() => {
              setOverflowOpen(false);
              onToggleDetails();
            }}
          >
            <PixelIcon name="panel" size={14} />
            <span>{t('studioPanel.tabs.details')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={`studio-head-menu-item${threadOpen ? ' is-active' : ''}`}
            aria-pressed={threadOpen}
            onClick={() => {
              setOverflowOpen(false);
              onToggleThread();
            }}
          >
            <PixelIcon name="chat" size={14} />
            <span>{t('studioPanel.rail.chat')}</span>
            {threadUnreadCount > 0 ? (
              <span className="studio-chat-unread-badge" aria-hidden="true">
                {threadUnreadCount > 99 ? '99+' : threadUnreadCount}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
