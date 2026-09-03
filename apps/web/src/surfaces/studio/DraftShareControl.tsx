import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { playPath } from '../../core/router.js';
import { setDraftShared, type StudioGame } from '../../studioApi.js';

// Who can play before publish — off until the creator opts in.

// Live games drop the toggle: the permalink is public by definition.
export function DraftShareControl({
  game,
  compact = false,
  live = false,
  onSharedChange,
}: {
  game: StudioGame;
  // Drop the card chrome when nested in the header popover.
  compact?: boolean;
  // Live in the catalog: permalink only, no draft switch.
  live?: boolean;
  onSharedChange?: (shared: boolean) => void;
}) {
  const { t } = useTranslation();
  const [shared, setShared] = useState(Boolean(game.draftShared));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Popover can unmount mid-toggle; ignore the result rather than setState.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShared(Boolean(game.draftShared));
  }, [game.draftShared, game.token]);

  const url = game.slug ? new URL(playPath(game.slug), window.location.href).toString() : '';

  async function toggle() {
    const next = !shared;
    setBusy(true);
    setError(null);
    // Optimistic: leaving the switch in place would read as a dead button.
    setShared(next);
    try {
      await setDraftShared(game.token, next);
      if (!mountedRef.current) return;
      onSharedChange?.(next);
    } catch {
      if (!mountedRef.current) return;
      setShared(!next);
      setError(t('studioPanel.share.error'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      if (!mountedRef.current) return;
      setCopied(true);
      window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      // Link is on screen to select by hand; no error state needed.
    }
  }

  return (
    <div className={`studio-share${compact ? ' is-compact' : ''}${live ? ' is-live' : ''}`}>
      <div className="studio-share-head">
        <h3 className="studio-share-title">{t(live ? 'studioPanel.share.liveTitle' : 'studioPanel.share.title')}</h3>
        {live ? null : (
          <button
            type="button"
            role="switch"
            aria-checked={shared}
            className={`studio-share-toggle${shared ? ' is-on' : ''}`}
            onClick={() => void toggle()}
            disabled={busy}
          >
            <span className="studio-share-toggle-track" aria-hidden="true" />
            {shared ? t('studioPanel.share.on') : t('studioPanel.share.off')}
          </button>
        )}
      </div>
      <p className="studio-share-hint">
        {t(live ? 'studioPanel.share.liveHint' : shared ? 'studioPanel.share.hintOn' : 'studioPanel.share.hintOff')}
      </p>
      {live || shared ? (
        <p className="status-note status-share">
          <a className="inline-link" href={url}>
            {url}
          </a>
          <button type="button" className="status-share-copy" onClick={() => void copy()}>
            <PixelIcon name={copied ? 'check' : 'globe'} size={12} />{' '}
            {copied ? t('statusView.shareCopied') : t('statusView.shareCopy')}
          </button>
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
