import { useRef, useLayoutEffect } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';
import { WorldState, Battle, State, Sector } from '../world/world-state-types';
import { renderExplosion } from './explosion-render';
import { renderMissile, renderChemtrail, renderInterceptor, renderInterceptorDisintegration } from './missile-render';
import {
  INTERCEPTOR_MAX_RANGE,
  INTERCEPTOR_SPEED,
  DEFENCE_LINE_COLORS,
  ACTIVE_DEFENCE_LINE_COLOR,
  DEFENCE_LINE_WIDTH,
  SECTOR_SIZE,
} from '../world/world-state-constants';

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

    // Render defence lines
    const playerState = state.states.find((s) => s.isPlayerControlled);
    if (playerState) {
      renderDefenceLines(ctx, playerState);
    }

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
        const distanceTraveled = INTERCEPTOR_SPEED * (state.timestamp - interceptor.launchTimestamp + 1);

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

    // Render battles
    state.battles.forEach((battle) => {
      renderBattle(ctx, battle);
    });
  };

  useRafLoop(renderFrame);
  return <Canvas ref={canvasRef} />;
}

function renderDefenceLines(ctx: CanvasRenderingContext2D, playerState: State) {
  playerState.defenceLines.forEach((defenceLine, index) => {
    const isActive = index === playerState.currentDefenceLineIndex;
    const color = isActive ? ACTIVE_DEFENCE_LINE_COLOR : DEFENCE_LINE_COLORS[index % DEFENCE_LINE_COLORS.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = DEFENCE_LINE_WIDTH;
    ctx.beginPath();

    let isNewSegment = true;
    for (let i = 0; i < defenceLine.sectors.length; i++) {
      const currentSector = defenceLine.sectors[i];
      const nextSector = defenceLine.sectors[i + 1];

      if (isNewSegment) {
        ctx.moveTo(currentSector.position.x, currentSector.position.y);
        isNewSegment = false;
      }

      if (nextSector && areAdjacent(currentSector, nextSector)) {
        ctx.lineTo(nextSector.position.x, nextSector.position.y);
      } else {
        ctx.lineTo(currentSector.position.x, currentSector.position.y);
        ctx.stroke();
        isNewSegment = true;
      }
    }

    if (!isNewSegment) {
      ctx.stroke();
    }
  });
}

function areAdjacent(sector1: Sector, sector2: Sector): boolean {
  const dx = Math.abs(sector1.position.x - sector2.position.x);
  const dy = Math.abs(sector1.position.y - sector2.position.y);
  return dx <= SECTOR_SIZE * 3 && dy <= SECTOR_SIZE * 3;
}

function renderBattle(ctx: CanvasRenderingContext2D, battle: Battle) {
  const { position, size } = battle;

  // Set up battle rendering style
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 2;

  // Draw a pulsating circle to represent the battle
  const pulseFactor = 1 + 0.2 * Math.sin(Date.now() / 200); // Pulsate every 200ms
  const radius = (size / 2) * pulseFactor;

  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw crossed swords icon in the center of the battle
  const swordLength = size / 4;
  const swordWidth = swordLength / 10;

  ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';

  // First sword
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-swordWidth / 2, -swordLength / 2, swordWidth, swordLength);
  ctx.restore();

  // Second sword
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-swordWidth / 2, -swordLength / 2, swordWidth, swordLength);
  ctx.restore();
}

const Canvas = styled.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;
