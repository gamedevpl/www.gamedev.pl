import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { ContextMenu } from './context-menu';
import { CanvasGrid } from './canvas-grid';
import {
  DESIGN_FIELD_WIDTH,
  DESIGN_FIELD_HEIGHT,
  SOLDIER_WIDTH,
  SOLDIER_HEIGHT,
  MAX_COL,
  MAX_ROW,
  GRID_CENTER_X,
  GRID_CENTER_Y,
} from '../../js/consts';

export interface Unit {
  id: number;
  col: number;
  row: number;
  sizeCol: number;
  sizeRow: number;
  type: string;
  command: string;
}

const centerAroundZero = (units: Unit[]): Unit[] => {
  const centerX = Math.floor(MAX_COL / 2);
  const centerY = Math.floor(MAX_ROW / 2);
  return units.map((unit) => ({
    ...unit,
    col: unit.col - centerX / 2,
    row: unit.row - centerY / 2,
  }));
};

const transformCoordinates = (col: number, row: number): { x: number; y: number } => {
  return {
    x: (col + GRID_CENTER_X) * SOLDIER_WIDTH,
    y: (row + GRID_CENTER_Y) * SOLDIER_HEIGHT,
  };
};

const inverseTransformCoordinates = (x: number, y: number): { col: number; row: number } => {
  return {
    col: Math.floor(x / SOLDIER_WIDTH) - GRID_CENTER_X,
    row: Math.floor(y / SOLDIER_HEIGHT) - GRID_CENTER_Y,
  };
};

export const DesignerScreen = ({ onStartBattle }: { onStartBattle: (units: Unit[]) => void }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedUnit, setDraggedUnit] = useState<Unit | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const designerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialUnits: Unit[] = [
      { id: 1, col: 0, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 2, col: 8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 3, col: 16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 4, col: 24, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 5, col: 8, row: 3, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
      { id: 6, col: 20, row: 3, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
      { id: 7, col: 8, row: 8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
      { id: 8, col: 20, row: 8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
      { id: 9, col: 12, row: 11, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait-advance' },
    ];
    setUnits(centerAroundZero(initialUnits));
  }, []);

  const handleCellClick = useCallback(
    (col: number, row: number) => {
      const clickedUnit = units.find(
        (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
      );

      if (clickedUnit) {
        setSelectedUnit(clickedUnit);
        const { x, y } = transformCoordinates(
          clickedUnit.col + clickedUnit.sizeCol / 2,
          clickedUnit.row + clickedUnit.sizeRow / 2,
        );
        setContextMenuPosition({ x, y });
      } else {
        setSelectedUnit(null);
        setContextMenuPosition(null);
      }
    },
    [units],
  );

  const handleUnitMove = useCallback((unit: Unit, newCol: number, newRow: number) => {
    setUnits((prevUnits) =>
      prevUnits.map((u) =>
        u.id === unit.id
          ? {
              ...u,
              col: Math.max(-GRID_CENTER_X, Math.min(newCol, MAX_COL - GRID_CENTER_X - u.sizeCol)),
              row: Math.max(-GRID_CENTER_Y, Math.min(newRow, MAX_ROW - GRID_CENTER_Y - u.sizeRow)),
            }
          : u,
      ),
    );
  }, []);

  const handleUnitModify = useCallback((unitId: number, changes: Partial<Unit>) => {
    setUnits((prevUnits) => prevUnits.map((u) => (u.id === unitId ? { ...u, ...changes } : u)));
    setSelectedUnit(null);
    setContextMenuPosition(null);
  }, []);

  const handleStartBattle = () => {
    console.log('Starting battle with units:', units);
    const centerX = Math.floor(MAX_COL / 2);
    const centerY = Math.floor(MAX_ROW / 2);

    onStartBattle(
      units.map((unit) => ({
        ...unit,
        col: unit.col + centerX / 2,
        row: unit.row + centerY / 2,
      })),
    );
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvas = e.target as HTMLCanvasElement;
    const { col, row } = inverseTransformCoordinates(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );

    const clickedUnit = units.find(
      (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
    );

    if (clickedUnit) {
      setIsDragging(true);
      setDraggedUnit(clickedUnit);
      setDragOffset({
        x:
          e.clientX -
          rect.left -
          transformCoordinates(clickedUnit.col, clickedUnit.row).x / (canvas.width / rect.width),
        y:
          e.clientY -
          rect.top -
          transformCoordinates(clickedUnit.col, clickedUnit.row).y / (canvas.height / rect.height),
      });
      setContextMenuPosition(null);
    }
  };

  const handleCanvasMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging && draggedUnit) {
        const canvas = e.target as HTMLCanvasElement;
        if (canvas?.tagName === 'CANVAS') {
          const rect = canvas.getBoundingClientRect();
          const { col, row } = inverseTransformCoordinates(
            (e.clientX - rect.left) * (canvas.width / rect.width) - dragOffset.x,
            (e.clientY - rect.top) * (canvas.height / rect.height) - dragOffset.y,
          );
          handleUnitMove(draggedUnit, col, row);
        }
      }
    },
    [isDragging, draggedUnit, dragOffset, handleUnitMove],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggedUnit(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleCanvasMouseMove);
      window.removeEventListener('mouseup', handleCanvasMouseUp);
    };
  }, [handleCanvasMouseMove, handleCanvasMouseUp]);

  return (
    <DesignerContainer ref={designerRef}>
      <CanvasGrid
        width={DESIGN_FIELD_WIDTH}
        height={DESIGN_FIELD_HEIGHT}
        cellWidth={SOLDIER_WIDTH}
        cellHeight={SOLDIER_HEIGHT}
        units={units}
        selectedUnitId={selectedUnit?.id || null}
        onCellClick={handleCellClick}
        onMouseDown={handleCanvasMouseDown}
      />
      {contextMenuPosition && selectedUnit && (
        <ContextMenu unit={selectedUnit} position={contextMenuPosition} onModify={handleUnitModify} />
      )}
      <button onClick={handleStartBattle}>Start Battle</button>
    </DesignerContainer>
  );
};

const DesignerContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;

  > button {
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    font-size: 16px;
    background-color: #4caf50;
    color: black;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }
`;
