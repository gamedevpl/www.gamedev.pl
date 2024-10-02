import React, { useRef, useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { GRID_CENTER_X, GRID_CENTER_Y, UNIT_ASSET_PATHS } from '../../js/consts';
import { Unit } from './designer-screen';

interface CanvasGridProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  units: Unit[];
  selectedUnitId: number | null;
  onCellClick: (col: number, row: number) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onModifyUnit: (unitId: number, changes: Partial<Pick<Unit, 'type' | 'sizeCol' | 'sizeRow'>>) => void;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const CanvasGrid: React.FC<CanvasGridProps> = React.memo(
  ({
    width,
    height,
    cellWidth,
    cellHeight,
    units,
    selectedUnitId,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onCellClick,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [unitImages, setUnitImages] = useState<Record<string, HTMLImageElement>>({});

    useEffect(() => {
      const loadUnitImages = async () => {
        const loadedImages: Record<string, HTMLImageElement> = {};
        for (const [unitType, imagePath] of Object.entries(UNIT_ASSET_PATHS)) {
          try {
            loadedImages[unitType] = await loadImage(imagePath);
          } catch (error) {
            console.error(`Failed to load image for ${unitType}:`, error);
          }
        }
        setUnitImages(loadedImages);
      };

      loadUnitImages();
    }, []);

    const drawGrid = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;

        for (let x = 0; x <= width; x += cellWidth) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        for (let y = 0; y <= height; y += cellHeight) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      },
      [width, height, cellWidth, cellHeight],
    );

    const drawUnits = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        units.forEach((unit) => {
          const x = (unit.col + GRID_CENTER_X) * cellWidth;
          const y = (unit.row + GRID_CENTER_Y) * cellHeight;
          const unitWidth = unit.sizeCol * cellWidth;
          const unitHeight = unit.sizeRow * cellHeight;

          if (unitImages[unit.type]) {
            for (let xi = 0; xi < unit.sizeCol; xi++)
              for (let yi = 0; yi < unit.sizeRow; yi++)
                ctx.drawImage(unitImages[unit.type], x + xi * cellWidth, y + yi * cellHeight, cellWidth, cellHeight);
          } else {
            // Fallback to colored rectangle if image is not loaded
            ctx.fillStyle = unit.type === 'archer' ? 'green' : unit.type === 'tank' ? 'blue' : 'red';
            ctx.fillRect(x, y, unitWidth, unitHeight);
          }

          // Draw border for selected unit
          if (unit.id === selectedUnitId) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, unitWidth, unitHeight);
          }

          // Draw unit type text
          ctx.fillStyle = 'white';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(unit.type, x + unitWidth / 2, y + unitHeight / 2);
        });
      },
      [units, selectedUnitId, unitImages, cellWidth, cellHeight],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear the canvas
      ctx.clearRect(0, 0, width, height);

      // Draw the grid
      drawGrid(ctx);

      // Draw the units
      drawUnits(ctx);
    }, [width, height, cellWidth, cellHeight, units, selectedUnitId, unitImages, drawGrid, drawUnits]);

    const handleCanvasClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);

        const col = Math.floor(x / cellWidth) - GRID_CENTER_X;
        const row = Math.floor(y / cellHeight) - GRID_CENTER_Y;

        onCellClick(col, row);
      },
      [cellWidth, cellHeight, onCellClick, units],
    );

    return (
      <CanvasContainer
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleCanvasClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      />
    );
  },
);

CanvasGrid.displayName = 'CanvasGrid';

const CanvasContainer = styled.canvas`
  position: absolute;
  transform: translate(-50%, -50%);
  left: 50%;
  top: 50%;
  max-width: 90vw;
  max-height: 80vh;
`;
