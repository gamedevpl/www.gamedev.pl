import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { BuildingType } from '../../game/entities/buildings/building-consts';
import { Vector2D } from '../../game/utils/math-types';
import { renderBuilding, renderGhostBuilding } from '../../game/render/render-building';
import { renderAllTerritories } from '../../game/render/render-territory';
import { IndexedWorldState } from '../../game/world-index/world-index-types';
import { canPlaceBuilding } from '../../game/utils/building-placement-utils';
import { PlannedGordEdge } from './types';
import { createMockWorldState } from './mock-state-utils';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../game/entities/tribe/territory-consts';

const StyledCanvas = styled.canvas`
  background-color: #2c5234;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  border: 2px solid #444;
  cursor: crosshair;
`;

interface GordCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  placedBuildings: BuildingEntity[];
  terrainOwnership: (number | null)[];
  showTerritoryGrid: boolean;
  showGordGrid: boolean;
  showPlannedGord: boolean;
  plannedGordEdges: PlannedGordEdge[];
  mousePos: Vector2D | null;
  selectedType: BuildingType;
  onClick: (x: number, y: number) => void;
  onMouseMove: (x: number, y: number) => void;
  onMouseLeave: () => void;
}

export const GordCanvas: React.FC<GordCanvasProps> = ({
  canvasWidth,
  canvasHeight,
  placedBuildings,
  terrainOwnership,
  showTerritoryGrid,
  showGordGrid,
  showPlannedGord,
  plannedGordEdges,
  mousePos,
  selectedType,
  onClick,
  onMouseMove,
  onMouseLeave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const viewportCenter = { x: canvasWidth / 2, y: canvasHeight / 2 };
      const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);

      // 1. Background
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 2. Territory Grid
      if (showTerritoryGrid) {
        renderAllTerritories(ctx, mockState, viewportCenter, { width: canvasWidth, height: canvasHeight }, 1);
      }

      // 3. Gord Grid
      if (showGordGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvasWidth; x += TERRITORY_OWNERSHIP_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvasHeight);
          ctx.stroke();
        }
        for (let y = 0; y <= canvasHeight; y += TERRITORY_OWNERSHIP_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvasWidth, y);
          ctx.stroke();
        }

        // Highlight eligible cells
        const gridWidth = Math.ceil(canvasWidth / TERRITORY_OWNERSHIP_RESOLUTION);
        const gridHeight = Math.ceil(canvasHeight / TERRITORY_OWNERSHIP_RESOLUTION);
        for (let gy = 0; gy < gridHeight; gy++) {
          for (let gx = 0; gx < gridWidth; gx++) {
            const idx = gy * gridWidth + gx;
            if (mockState.terrainOwnership[idx] === 1) {
              ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
              ctx.fillRect(
                gx * TERRITORY_OWNERSHIP_RESOLUTION,
                gy * TERRITORY_OWNERSHIP_RESOLUTION,
                TERRITORY_OWNERSHIP_RESOLUTION,
                TERRITORY_OWNERSHIP_RESOLUTION,
              );
            }
          }
        }
      }

      // 4. Placed Buildings
      for (const building of placedBuildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      // 5. Planned Gord
      if (showPlannedGord && plannedGordEdges.length > 0) {
        ctx.save();
        for (const edge of plannedGordEdges) {
          ctx.strokeStyle = edge.isGate ? '#4080FF' : '#8B4513';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(edge.from.x, edge.from.y);
          ctx.lineTo(edge.to.x, edge.to.y);
          ctx.stroke();

          if (edge.isGate) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
            ctx.fillRect(
              edge.from.x < edge.to.x ? edge.from.x : edge.to.x,
              edge.from.y < edge.to.y ? edge.from.y : edge.to.y,
              Math.abs(edge.to.x - edge.from.x) || 10,
              Math.abs(edge.to.y - edge.from.y) || 10,
            );
          }
        }
        ctx.restore();
      }

      // 6. Ghost and mouse feedback
      if (mousePos) {
        const canPlace = canPlaceBuilding(mousePos, selectedType, 1, mockState);
        renderGhostBuilding(ctx, mousePos, selectedType, canPlace, { width: canvasWidth, height: canvasHeight });

        ctx.save();
        ctx.font = '12px Arial';
        ctx.fillStyle = canPlace ? '#00FF00' : '#FF0000';
        ctx.fillText(canPlace ? '✓ Valid placement' : '✗ Invalid placement', mousePos.x + 15, mousePos.y - 15);
        ctx.restore();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [
    canvasWidth,
    canvasHeight,
    placedBuildings,
    terrainOwnership,
    showTerritoryGrid,
    showGordGrid,
    showPlannedGord,
    plannedGordEdges,
    mousePos,
    selectedType,
  ]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onClick(x, y);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onMouseMove(x, y);
  };

  return (
    <StyledCanvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onClick={handleCanvasClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
    />
  );
};
