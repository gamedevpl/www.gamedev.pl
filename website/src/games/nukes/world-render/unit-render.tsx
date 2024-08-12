import React, { useRef, useEffect } from 'react';
import { WorldState, Unit } from '../world/world-state-types';

const UNIT_SIZE = 10; // Size of the unit rectangle

interface UnitCanvasProps {
  worldStateRef: React.RefObject<WorldState>;
}

export const UnitCanvas: React.FC<UnitCanvasProps> = ({ worldStateRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const worldState = worldStateRef.current;
    if (!worldState) return;

    const sectors = worldState.sectors;
    const minX = Math.min(...sectors.map((s) => s.rect.left));
    const minY = Math.min(...sectors.map((s) => s.rect.top));
    const maxX = Math.max(...sectors.map((s) => s.rect.right));
    const maxY = Math.max(...sectors.map((s) => s.rect.bottom));

    const width = maxX - minX;
    const height = maxY - minY;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const render = () => {
      const worldState = worldStateRef.current;
      if (!worldState) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      worldState.units.forEach((unit) => {
        drawUnit(ctx, unit, worldState);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [worldStateRef]);

  const drawUnit = (ctx: CanvasRenderingContext2D, unit: Unit, worldState: WorldState) => {
    const { x, y } = unit.position;
    const state = worldState.states.find((s) => s.id === unit.stateId);
    const color = state ? state.color : '#000000';

    // Draw rectangle
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.fillRect(x - UNIT_SIZE / 2, y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);
    ctx.strokeRect(x - UNIT_SIZE / 2, y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);

    // Draw diagonals
    ctx.beginPath();
    ctx.moveTo(x - UNIT_SIZE / 2, y - UNIT_SIZE / 2);
    ctx.lineTo(x + UNIT_SIZE / 2, y + UNIT_SIZE / 2);
    ctx.moveTo(x + UNIT_SIZE / 2, y - UNIT_SIZE / 2);
    ctx.lineTo(x - UNIT_SIZE / 2, y + UNIT_SIZE / 2);
    ctx.stroke();
  };

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />;
};
