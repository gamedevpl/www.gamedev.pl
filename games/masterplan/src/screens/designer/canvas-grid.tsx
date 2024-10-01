import React, { useRef, useEffect, useState } from 'react';
import { GRID_CENTER_X, GRID_CENTER_Y, UNIT_ASSET_PATHS } from '../../js/consts';

interface Unit {
  id: number;
  col: number;
  row: number;
  sizeCol: number;
  sizeRow: number;
  type: string;
  command: string;
}

interface CanvasGridProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  units: Unit[];
  selectedUnitId: number | null;
  onCellClick: (col: number, row: number) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const CanvasGrid: React.FC<CanvasGridProps> = ({
  width,
  height,
  cellWidth,
  cellHeight,
  units,
  selectedUnitId,
  onMouseDown,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Draw the grid
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

    // Draw the units
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
  }, [width, height, cellWidth, cellHeight, units, selectedUnitId, unitImages]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const col = Math.floor(x / cellWidth) - GRID_CENTER_X;
    const row = Math.floor(y / cellHeight) - GRID_CENTER_Y;

    onCellClick(col, row);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleCanvasClick}
      onMouseDown={onMouseDown}
      style={{ border: '1px solid #000' }}
    />
  );
};
