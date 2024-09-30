import React, { useRef, useEffect } from 'react';

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
      const x = unit.col * cellWidth;
      const y = unit.row * cellHeight;
      const unitWidth = unit.sizeCol * cellWidth;
      const unitHeight = unit.sizeRow * cellHeight;

      // Set unit color based on type
      switch (unit.type) {
        case 'archer':
          ctx.fillStyle = 'green';
          break;
        case 'tank':
          ctx.fillStyle = 'blue';
          break;
        default:
          ctx.fillStyle = 'red';
      }

      ctx.fillRect(x, y, unitWidth, unitHeight);

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
  }, [width, height, cellWidth, cellHeight, units, selectedUnitId]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

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
