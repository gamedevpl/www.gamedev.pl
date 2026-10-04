import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './studio-details-resize.css';

const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 480;
const MAX_WIDTH = 720;
const PREFERENCE = 'gdpl:studio-details-width';

function savedWidth() {
  try {
    const value = Number(localStorage.getItem(PREFERENCE));
    return Number.isFinite(value) && value >= MIN_WIDTH ? Math.min(value, MAX_WIDTH) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function StudioDetailsRail({ isSheet, children }: { isSheet: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const rail = useRef<HTMLElement>(null);
  const id = useId();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(savedWidth);
  const [maximum, setMaximum] = useState(MAX_WIDTH);
  const [resizing, setResizing] = useState(false);
  const minimum = Math.min(MIN_WIDTH, maximum);
  const actualWidth = Math.min(width, maximum);
  useEffect(() => {
    const parent = rail.current?.parentElement;
    if (!parent) return;
    const sync = () => setMaximum(Math.max(1, Math.min(MAX_WIDTH, parent.clientWidth - 48)));
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(parent);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCE, String(width));
    } catch {
      // Storage may be disabled by browser policy.
    }
  }, [width]);
  useEffect(() => {
    if (isSheet) {
      drag.current = null;
      setResizing(false);
    }
  }, [isSheet]);
  const resize = (next: number) => setWidth(Math.round(Math.max(minimum, Math.min(maximum, next))));
  return (
    <aside
      ref={rail}
      id={id}
      className="studio-rail"
      aria-label={t('studioPanel.tabs.details')}
      style={{ '--studio-rail-width': `${actualWidth}px` } as CSSProperties}
      {...(isSheet ? { role: 'dialog', 'aria-modal': true } : {})}
    >
      {!isSheet && (
        <div
          className="studio-rail-resize"
          role="separator"
          tabIndex={0}
          aria-label={t('studioPanel.rail.resize')}
          title={t('studioPanel.rail.resize')}
          aria-orientation="vertical"
          aria-valuemin={minimum}
          aria-controls={id}
          aria-valuemax={maximum}
          aria-valuenow={actualWidth}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, width: actualWidth };
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (drag.current) resize(drag.current.width + drag.current.x - event.clientX);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            setResizing(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setResizing(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setResizing(false);
          }}
          onDoubleClick={() => resize(DEFAULT_WIDTH)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowLeft'
                ? actualWidth + 40
                : event.key === 'ArrowRight'
                  ? actualWidth - 40
                  : event.key === 'Home'
                    ? minimum
                    : event.key === 'End'
                      ? maximum
                      : null;
            if (next === null) return;
            event.preventDefault();
            resize(next);
          }}
        />
      )}
      {resizing && <div className="studio-rail-resize-shield" />}
      {children}
    </aside>
  );
}
