import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildMediaUrl, type BuildMediaItem } from '../../submissionApi.js';
import './status-play-card.css';

export function ShotLightbox({ token, item, onClose }: { token: string; item: BuildMediaItem; onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="status-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={item.label || t('statusView.gallery.alt')}
      onClick={onClose}
    >
      <img
        className="status-lightbox-image"
        src={buildMediaUrl(token, item)}
        alt={item.label || t('statusView.gallery.alt')}
        onClick={(event) => event.stopPropagation()}
      />
      {item.label ? <p className="status-lightbox-caption">{item.label}</p> : null}
      <button type="button" className="status-lightbox-close" onClick={onClose}>
        {t('statusView.gallery.close')}
      </button>
    </div>
  );
}
