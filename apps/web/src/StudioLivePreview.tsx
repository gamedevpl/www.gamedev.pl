import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n/index.js';
import { embedGameHtml, postGameHostMessage, withGameLocale } from './gamePlayer.js';
import { PixelIcon } from './PixelIcon.js';

/**
 * The game as it stands, running in the corner of the thread.
 *
 * Studio has always *had* the latest playable draft — it is on the play rail, one click
 * from the theater — and creators still sat watching a status page, because a click is a
 * decision and "is there anything to see yet" is not worth making one for. The whole
 * complaint this answers is about a stretch of a build where the agent is deep in details
 * and the only honest answer to "how is it going" is a picture of the game moving.
 *
 * Three deliberate constraints:
 *
 *  - **It does not take input.** The frame is `pointer-events: none` and out of the tab
 *    order; a click lands on the overlay button above it and opens the real theater. A
 *    small frame is not a place to play — Studio's own playtest panel learned that inset
 *    frames are unplayable on phones — so this is a window, and playing is elsewhere.
 *  - **It is silent, and it freezes with the tab.** A background thumbnail that starts
 *    playing music is a bug however faithful it is to the game. It mutes on load and
 *    pauses when the document is hidden, which also keeps a hidden tab from burning a
 *    phone battery on a game nobody is looking at.
 *  - **It never covers the composer.** Anchored to the top edge of the thread's foot, so
 *    whatever height the reply box and its status chips take, this floats above them —
 *    the failure this shell has already had once, from a bottom-fixed banner.
 *
 * Dismissal is remembered for the session: a creator who does not want it does not have
 * to keep closing it, and the play rail is still there when they change their mind.
 */

const DISMISS_KEY_PREFIX = 'studio-live-preview-dismiss:';

/**
 * Tries at 0/250/500/750ms. The bridge drives the game's own `#sound-toggle`, which
 * GameKit mounts when the game boots rather than when the document parses — a single
 * mute on load lands before the control exists and silently does nothing.
 */
const MUTE_ATTEMPTS = 4;
const MUTE_INTERVAL_MS = 250;

function dismissKey(token: string): string {
  return `${DISMISS_KEY_PREFIX}${token}`;
}

function readDismissed(token: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(token)) === '1';
  } catch {
    // Private mode: the dismissal still holds for this mount via React state.
    return false;
  }
}

function rememberDismissed(token: string): void {
  try {
    sessionStorage.setItem(dismissKey(token), '1');
  } catch {
    /* see readDismissed */
  }
}

export type StudioLivePreviewProps = {
  /** Scopes the session-long dismissal to one game's thread. */
  token: string;
  /** The assembled draft, already fetched by the thread. Null means nothing to show. */
  html: string | null;
  /** Accessible name for the frame — the game's title when the thread knows one. */
  title: string;
  /** Agent- or platform-authored caption for this draft. Untrusted: rendered as text. */
  label?: string | undefined;
  /** Opens the real player. The card is a window; this is the way in. */
  onOpen: () => void;
};

export function StudioLivePreview({ token, html, title, label, onOpen }: StudioLivePreviewProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => readDismissed(token));
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setDismissed(readDismissed(token));
  }, [token]);

  // Freeze while the tab is in the background. The bridge holds requestAnimationFrame
  // and suspends AudioContext, so a hidden tab costs nothing rather than running a game
  // loop nobody can see.
  useEffect(() => {
    if (dismissed || !html) return;
    const onVisibility = () => {
      postGameHostMessage(frameRef.current, { type: document.visibilityState === 'hidden' ? 'pause' : 'resume' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [dismissed, html]);

  if (dismissed || !html) return null;

  const muteRepeatedly = () => {
    for (let attempt = 0; attempt < MUTE_ATTEMPTS; attempt++) {
      window.setTimeout(
        () => postGameHostMessage(frameRef.current, { type: 'setSound', muted: true }),
        attempt * MUTE_INTERVAL_MS,
      );
    }
  };

  // Same preparation every embedded game document gets: the app's language, then the
  // player bridge that hides the game's own title/description chrome (which would eat
  // most of a frame this size) and accepts the mute and pause above.
  const srcDoc = embedGameHtml(withGameLocale(html, i18n.language));

  return (
    <div className="studio-live-preview" data-testid="studio-live-preview">
      <div className="studio-live-preview-frame">
        <iframe
          ref={frameRef}
          className="studio-live-preview-iframe"
          title={title}
          // The safety invariant, unchanged: opaque origin, no allow-same-origin. This
          // document is unreviewed agent output and is isolated exactly like a played one.
          sandbox="allow-scripts allow-pointer-lock"
          srcDoc={srcDoc}
          onLoad={muteRepeatedly}
          // Out of the tab order and deaf to the pointer — the overlay button below is the
          // only interactive thing here, so the frame can never steal focus from the
          // composer or swallow a tap meant for the conversation.
          tabIndex={-1}
          aria-hidden="true"
          scrolling="no"
        />
        <button
          type="button"
          className="studio-live-preview-open"
          onClick={onOpen}
          title={t('studioPanel.livePreview.open')}
        >
          <span className="studio-live-preview-open-label">
            <PixelIcon name="gamepad" size={12} /> {t('studioPanel.livePreview.open')}
          </span>
        </button>
      </div>

      <div className="studio-live-preview-foot">
        <span className="studio-live-preview-badge">
          <span className="live-dot" aria-hidden="true" /> {t('studioPanel.livePreview.badge')}
        </span>
        <button
          type="button"
          className="studio-live-preview-dismiss"
          aria-label={t('studioPanel.livePreview.dismiss')}
          onClick={() => {
            rememberDismissed(token);
            setDismissed(true);
          }}
        >
          <PixelIcon name="close" size={10} />
        </button>
      </div>
      {label ? <p className="studio-live-preview-caption">{label}</p> : null}
    </div>
  );
}
