import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildMediaUrl, getSubmissionStatus, type BuildMediaItem } from '../../submissionApi.js';

/** Details refreshes slower than the thread — the thread already owns the live pulse. */
const DETAILS_POLL_MS = 10_000;

/**
 * Screenshots / video for the Details rail — the durable home for build media.
 * The near-Play toast stack is only a notification; this pane is the layout.
 */
export function StudioDetailsMedia({ token, emptyLabel }: { token: string; emptyLabel?: string }) {
  const { t, i18n } = useTranslation();
  const [media, setMedia] = useState<BuildMediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const status = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;
        setMedia(status.media ?? []);
      } catch {
        /* Secondary chrome — a failed poll must not toast over the thread. */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), DETAILS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, i18n.language]);

  useEffect(() => {
    setLightbox(null);
  }, [token]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (!loaded) {
    return <p className="studio-rail-empty">{t('statusView.loading')}</p>;
  }

  if (media.length === 0) {
    return <p className="studio-rail-empty">{emptyLabel ?? t('studioPanel.rail.mediaEmpty')}</p>;
  }

  return (
    <>
      <div className="studio-details-media" data-testid="studio-details-media">
        <div className="studio-details-media-grid">
          {media.map((item) => {
            const src = buildMediaUrl(token, item);
            const key = `${item.source}:${item.ref}`;
            const label = item.label?.trim() || t('studioPanel.preview.shot');
            return (
              <button
                key={key}
                type="button"
                className="studio-details-media-card"
                onClick={() => setLightbox(src)}
                aria-label={label}
              >
                <img src={src} alt="" loading="lazy" />
                <span className="studio-details-media-caption">{label}</span>
              </button>
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
