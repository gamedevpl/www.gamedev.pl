import React from 'react';
import { SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../battle/consts';

interface GridCellProps {
  col: number;
  row: number;
  onClick: (col: number, row: number) => void;
}

export const GridCell: React.FC<GridCellProps> = ({ col, row, onClick }) => {
  const handleClick = (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    onClick(col, row);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const unitId = event.dataTransfer.getData('text/plain');
    // Here you would typically call a function to update the unit's position
    console.log(`Dropped unit ${unitId} onto cell (${col}, ${row})`);
  };

  return (
    <div
      style={{
        width: SOLDIER_WIDTH,
        height: SOLDIER_HEIGHT,
        border: '1px solid #eee',
        position: 'absolute',
        left: col * SOLDIER_WIDTH,
        top: row * SOLDIER_HEIGHT,
        boxSizing: 'border-box',
      }}
      onClick={handleClick}
      onTouchStart={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
};
