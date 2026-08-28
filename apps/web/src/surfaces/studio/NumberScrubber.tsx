import { useCallback, useRef, useState } from 'react';

// Drag-to-scrub for a declared EDITOR.json param.

const PIXELS_PER_STEP = 4;
const COARSE_MULTIPLIER = 10;

export type NumberScrubberProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
};

export function NumberScrubber({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  formatValue,
  disabled,
}: NumberScrubberProps) {
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);

  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [min, max]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pixels = event.clientX - drag.startX;
    const multiplier = event.shiftKey ? COARSE_MULTIPLIER : 1;
    onChange(clamp(drag.startValue + (pixels / PIXELS_PER_STEP) * step * multiplier));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const multiplier = event.shiftKey ? COARSE_MULTIPLIER : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(clamp(value + step * multiplier));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(clamp(value - step * multiplier));
    }
  }

  return (
    <div
      className={`number-scrubber${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {formatValue ? formatValue(value) : value}
    </div>
  );
}
