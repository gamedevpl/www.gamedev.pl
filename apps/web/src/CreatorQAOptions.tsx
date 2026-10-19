import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import './creator-qa-options.css';

interface OptionsQuestion {
  id: string;
  question: string;
  options: Array<{ label: string; detail?: string }>;
  multiple?: boolean;
}

interface CreatorQAOptionsProps {
  question: OptionsQuestion;
  selected: string[];
  submitting: boolean;
  // Every option's tile, or nothing: a subset reads as a recommendation.
  art?: Record<string, string>;
  // Tiles are on their way, so placeholders hold their place.
  artLoading: boolean;
  onSelect: (label: string) => void;
}

// The answer cards of one question, with tiles and their zoom view.
export function CreatorQAOptions({ question, selected, submitting, art, artLoading, onSelect }: CreatorQAOptionsProps) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState<string | null>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement | null>(null);
  const zoomedSrc = zoomed ? art?.[zoomed] : undefined;

  const closeZoom = () => {
    setZoomed(null);
    zoomTriggerRef.current?.focus();
  };

  return (
    <>
      {artLoading && (
        <p className="qa-tiles-status" role="status">
          {t('qa.tilesLoading')}
        </p>
      )}

      <div className={`qa-options${art || artLoading ? ' qa-options--art' : ''}`}>
        {question.options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          const src = art?.[opt.label];
          const card = (
            <button
              key={opt.label}
              type="button"
              // Without it a screen reader announces every option the same.
              aria-pressed={isSelected}
              className={`qa-option${isSelected ? ' qa-option--selected' : ''}${
                question.multiple ? ' qa-option--multi' : ''
              }`}
              disabled={submitting}
              onClick={() => onSelect(opt.label)}
            >
              {src && <img className="qa-option__art" src={src} alt="" loading="lazy" />}
              {!src && artLoading && <span className="qa-option__art qa-option__art--loading" aria-hidden="true" />}
              <span className="qa-option__tick" aria-hidden="true" />
              <span className="qa-option__text">
                <span className="qa-option__label">{opt.label}</span>
                {opt.detail && <span className="qa-option__detail">{opt.detail}</span>}
              </span>
            </button>
          );
          if (!src) return card;
          return (
            <div key={opt.label} className="qa-option-cell">
              {card}
              <button
                type="button"
                className="qa-option__zoom"
                aria-label={t('qa.zoomTile', { label: opt.label })}
                onClick={(event) => {
                  zoomTriggerRef.current = event.currentTarget;
                  setZoomed(opt.label);
                }}
              >
                <PixelIcon name="expand" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {zoomed && zoomedSrc && <TileZoom label={zoomed} src={zoomedSrc} onClose={closeZoom} />}
    </>
  );
}

function TileZoom({ label, src, onClose }: { label: string; src: string; onClose: () => void }) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="qa-tile-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      onKeyDown={(event) => {
        // The wizard's own handler must not see these keys.
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Tab') {
          event.preventDefault();
        }
      }}
    >
      <img className="qa-tile-zoom__image" src={src} alt={label} onClick={(event) => event.stopPropagation()} />
      <button
        ref={closeRef}
        type="button"
        className="qa-tile-zoom__close"
        aria-label={t('qa.closeZoom')}
        onClick={onClose}
      >
        <PixelIcon name="close" size={14} />
      </button>
    </div>
  );
}
