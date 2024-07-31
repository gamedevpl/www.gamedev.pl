import { useRef, useLayoutEffect } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';
import { WorldState } from '../world/world-state-types';
import { renderMissile, renderChemtrail } from './missile-render';

export function EffectsCanvas({ state }: { state: WorldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Calculate the canvas size based on the world size
    const minX = Math.min(...state.sectors.map((s) => s.rect.left));
    const minY = Math.min(...state.sectors.map((s) => s.rect.top));
    const maxX = Math.max(...state.sectors.map((s) => s.rect.right));
    const maxY = Math.max(...state.sectors.map((s) => s.rect.bottom));

    const width = maxX - minX;
    const height = maxY - minY;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [state.sectors]);

  const renderFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render chemtrails
    state.missiles.forEach((missile) => {
      renderChemtrail(ctx, missile, state.timestamp);
    });

    // Render missiles
    state.missiles
      .filter((missile) => missile.launchTimestamp < state.timestamp && missile.targetTimestamp > state.timestamp)
      .forEach((missile) => {
        renderMissile(ctx, missile, state.timestamp);
      });
  };

  useRafLoop(renderFrame);
  return <Canvas ref={canvasRef} />;
}

const Canvas = styled.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;
