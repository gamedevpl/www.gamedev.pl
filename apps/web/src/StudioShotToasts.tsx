import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { buildMediaUrl, getSubmissionStatus, type BuildMediaItem } from './submissionApi.js';

/**
 * Codex-inspired screenshot toasts for Creator Studio.
 * Slightly scattered stack, aligned near the Play control (or bottom-right).
 * Dismissable; pause stays in the playtest theater.
 */

const MAX_VISIBLE = 3;
const POLL_MS = 12_000;

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
  /** Where the stack sits inside `.studio-detail`. */
  placement?: StudioShotToastsPlacement;
};

export function StudioShotToasts({ token, placement = 'near-play' }: StudioShotToastsProps) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<BuildMediaItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);

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
  }, [token]);

  const visible = useMemo(() => {
    return media
      .filter((item) => {
        const key = `${item.source}:${item.ref}`;
        if (dismissed.has(key)) return false;
        return !isDismissed(token, item);
      })
      .slice(0, MAX_VISIBLE);
  }, [media, dismissed, token]);

  if (visible.length === 0 && !lightbox) return null;

  return (
    <>
      <div className={`studio-shot-toasts is-${placement}`} role="region" aria-label={t('studioPanel.preview.media')}>
        {visible.map((item, index) => {
          const src = buildMediaUrl(token, item);
          const key = `${item.source}:${item.ref}`;
          const label = item.label?.trim() || t('studioPanel.preview.shot');
          return (
            <div key={key} className={`studio-shot-toast is-slot-${index}`} style={{ zIndex: MAX_VISIBLE - index }}>
              <button
                type="button"
                className="studio-shot-toast-body"
                onClick={() => setLightbox(src)}
                aria-label={label}
              >
                <img src={src} alt="" loading="lazy" />
                <span className="studio-shot-toast-caption">{label}</span>
              </button>
              <button
                type="button"
                className="studio-shot-toast-dismiss"
                aria-label={t('studioPanel.preview.dismissShot')}
                onClick={() => {
                  markDismissed(token, item);
                  setDismissed((prev) => new Set(prev).add(key));
                }}
              >
                <PixelIcon name="close" size={10} />
              </button>
            </div>
          );
        })}
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
