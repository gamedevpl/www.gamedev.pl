import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';

/**
 * One-tap share of a published game's `/play/<slug>` permalink.
 *
 * Prefers the OS share sheet (`navigator.share`) so phones get their native
 * targets; falls back to copying the URL when the sheet is unavailable or the
 * user dismisses it without sharing. Either way the control stays useful —
 * a share button that only works on some browsers is worse than a quiet copy.
 */
export function ShareGameButton({ slug, title }: { slug: string; title: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const playUrl = () => `${window.location.origin}/play/${encodeURIComponent(slug)}`;

  const share = async () => {
    const url = playUrl();
    const canShare =
      typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ url, title, text: title }));

    if (canShare) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (error) {
        // AbortError = user cancelled the sheet; leave quietly. Anything else
        // falls through to the clipboard path below.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission — the address bar already has the permalink
      // while playing, so there is nothing useful to surface as an error.
    }
  };

  return (
    <button
      type="button"
      className="secondary-btn share-btn"
      onClick={() => void share()}
      aria-label={copied ? t('player.shareCopied') : t('player.share')}
      title={copied ? t('player.shareCopied') : t('player.share')}
    >
      <PixelIcon name={copied ? 'check' : 'share'} size={13} />
      <span className="btn-label">{copied ? t('player.shareCopied') : t('player.share')}</span>
    </button>
  );
}
