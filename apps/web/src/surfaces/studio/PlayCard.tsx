import type { ReactNode } from 'react';
import { PixelIcon } from '../../PixelIcon.js';

// Play CTA; opens the full-viewport theater instead of an inline iframe.

// Used for both the draft and the published game.
export function PlayCard({
  badge,
  badgeClass,
  title,
  subtitle,
  cta,
  onPlay,
  secondary,
}: {
  badge: ReactNode;
  badgeClass?: string;
  title: string;
  subtitle?: string;
  cta: string;
  onPlay: () => void;
  // Optional playtest action — pause, mark, and send a frame with a note.
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="status-play-card">
      <div className="status-play-card-info">
        <span className={badgeClass ? `status-play-badge ${badgeClass}` : 'status-play-badge'}>{badge}</span>
        <h3 className="status-play-card-title">{title}</h3>
        {subtitle ? <p className="status-play-card-sub">{subtitle}</p> : null}
      </div>
      <div className="status-play-card-actions">
        <button type="button" className="primary-btn status-play-cta" onClick={onPlay}>
          <PixelIcon name="play" size={13} /> {cta}
        </button>
        {secondary ? (
          <button type="button" className="secondary-btn status-playtest-cta" onClick={secondary.onClick}>
            <PixelIcon name="wrench" size={13} /> {secondary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
