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
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const render = () => {
      const worldState = worldStateRef.current;
      if (!worldState) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      drawUnits(ctx, worldState);
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [worldStateRef]);

  const drawUnits = (ctx: CanvasRenderingContext2D, worldState: WorldState) => {
    const unitsByState: Record<string, Unit[]> = {};

    // Group units by their stateId
    worldState.units.forEach((unit) => {
      const stateId = unit.stateId;
      if (!unitsByState[stateId]) {
        unitsByState[stateId] = [];
      }
      unitsByState[stateId].push(unit);
    });

    // Draw units grouped by state
    Object.entries(unitsByState).forEach(([stateId, units]) => {
      const state = worldState.states.find((s) => s.id === stateId);
      const color = state ? state.color : '#000000';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;

      units.forEach((unit) => {
        // Draw rectangle
        ctx.fillRect(unit.position.x - UNIT_SIZE / 2, unit.position.y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);
        ctx.strokeRect(unit.position.x - UNIT_SIZE / 2, unit.position.y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);

        // Draw diagonals
        ctx.beginPath();
        ctx.moveTo(unit.position.x - UNIT_SIZE / 2, unit.position.y - UNIT_SIZE / 2);
        ctx.lineTo(unit.position.x + UNIT_SIZE / 2, unit.position.y + UNIT_SIZE / 2);
        ctx.moveTo(unit.position.x + UNIT_SIZE / 2, unit.position.y - UNIT_SIZE / 2);
        ctx.lineTo(unit.position.x - UNIT_SIZE / 2, unit.position.y + UNIT_SIZE / 2);
        ctx.stroke();
      });
    });
  };

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />;
};
