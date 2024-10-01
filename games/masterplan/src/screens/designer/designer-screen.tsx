import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ContextMenu } from './context-menu';
import { CanvasGrid } from './canvas-grid';
import {
  DESIGN_FIELD_WIDTH,
  DESIGN_FIELD_HEIGHT,
  SOLDIER_WIDTH,
  SOLDIER_HEIGHT,
  MAX_COL,
  MAX_ROW,
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

export const DesignerScreen = ({ onStartBattle }: { onStartBattle: (units: Unit[]) => void }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedUnit, setDraggedUnit] = useState<Unit | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const designerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial units with the new configuration
    const initialUnits: Unit[] = [
      // Warriors (4 units, 8x2 each)
      { id: 1, col: 0, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 2, col: 8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 3, col: 16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
      { id: 4, col: 24, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },

      // Tanks (2 units, 4x4 each)
      { id: 5, col: 8, row: 3, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
      { id: 6, col: 20, row: 3, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },

      // Archers (2 units, 4x2 each)
      { id: 7, col: 8, row: 8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
      { id: 8, col: 20, row: 8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },

      // Artillery (1 unit, 8x1)
      { id: 9, col: 12, row: 11, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait-advance' },
    ];
    setUnits(initialUnits);
  }, []);

  const handleCellClick = useCallback(
    (col: number, row: number) => {
      const clickedUnit = units.find(
        (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
      );

      if (clickedUnit) {
        setSelectedUnit(clickedUnit);
        const rect = designerRef.current?.getBoundingClientRect();
        if (rect) {
          setContextMenuPosition({
            x: (clickedUnit.col + clickedUnit.sizeCol / 2) * SOLDIER_WIDTH,
            y: (clickedUnit.row + clickedUnit.sizeRow / 2) * SOLDIER_HEIGHT,
          });
        }
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
              col: Math.max(0, Math.min(newCol, MAX_COL - u.sizeCol)),
              row: Math.max(0, Math.min(newRow, MAX_ROW - u.sizeRow)),
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
    onStartBattle(units);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / SOLDIER_WIDTH);
    const row = Math.floor((e.clientY - rect.top) / SOLDIER_HEIGHT);

    const clickedUnit = units.find(
      (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
    );

    if (clickedUnit) {
      setIsDragging(true);
      setDraggedUnit(clickedUnit);
      setDragOffset({
        x: e.clientX - rect.left - clickedUnit.col * SOLDIER_WIDTH,
        y: e.clientY - rect.top - clickedUnit.row * SOLDIER_HEIGHT,
      });
      setContextMenuPosition(null);
    }
  };

  const handleCanvasMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging && draggedUnit) {
        const rect = designerRef.current?.getBoundingClientRect();
        if (rect) {
          const newCol = Math.floor((e.clientX - rect.left - dragOffset.x) / SOLDIER_WIDTH);
          const newRow = Math.floor((e.clientY - rect.top - dragOffset.y) / SOLDIER_HEIGHT);
          handleUnitMove(draggedUnit, newCol, newRow);
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
    <div
      ref={designerRef}
      style={{
        position: 'relative',
      }}
    >
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
      <button
        style={{
          position: 'absolute',
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#4CAF50',
          color: 'black',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
        onClick={handleStartBattle}
      >
        Start Battle
      </button>
    </div>
  );
};
