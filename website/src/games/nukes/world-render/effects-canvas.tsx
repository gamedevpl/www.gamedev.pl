import { useRef, useLayoutEffect } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';
import { WorldState } from '../world/world-state-types';
import { renderExplosion } from './explosion-render';
import { renderMissile, renderChemtrail, renderInterceptor, renderInterceptorDisintegration } from './missile-render';
import { INTERCEPTOR_MAX_RANGE, INTERCEPTOR_SPEED } from '../world/world-state-constants';

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

    // Render chemtrails for missiles
    state.missiles.forEach((missile) => {
      renderChemtrail(ctx, missile, state.timestamp);
    });

    // Render chemtrails for interceptors
    state.interceptors.forEach((interceptor) => {
      renderChemtrail(ctx, interceptor, state.timestamp);
    });

    // Render missiles
    state.missiles
      .filter((missile) => missile.launchTimestamp < state.timestamp && missile.targetTimestamp > state.timestamp)
      .forEach((missile) => {
        renderMissile(ctx, missile, state.timestamp);
      });

    // Render interceptors
    state.interceptors
      .filter((interceptor) => interceptor.launchTimestamp < state.timestamp)
      .forEach((interceptor) => {
        renderInterceptor(ctx, interceptor);

        // Calculate distance traveled
        const distanceTraveled = INTERCEPTOR_SPEED * (state.timestamp - interceptor.launchTimestamp + 0.5);

        // Render disintegration animation if interceptor exceeds max range
        if (distanceTraveled > INTERCEPTOR_MAX_RANGE) {
          renderInterceptorDisintegration(ctx, interceptor);
        }
      });

    // Render explosions
    state.explosions
      .filter((explosion) => explosion.startTimestamp < state.timestamp && explosion.endTimestamp > state.timestamp)
      .forEach((explosion) => {
        renderExplosion(ctx, explosion, state.timestamp);
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
