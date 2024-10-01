import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { CanvasGrid } from './canvas-grid';
import { ContextMenu } from './context-menu';
import { useUnitDrag } from './hooks/unit-drag';
import { useUnitSelection } from './hooks/unit-selection';
import { transformCoordinates } from './utils/coordinate-transforms';
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

const centerAroundZero = (units: Unit[]): Unit[] => {
  const centerX = Math.floor(MAX_COL / 2);
  const centerY = Math.floor(MAX_ROW / 2);
  return units.map((unit) => ({
    ...unit,
    col: unit.col - centerX / 2,
    row: unit.row - centerY / 2,
  }));
};

interface DesignerScreenProps {
  onStartBattle: (units: Unit[]) => void;
}

export const DesignerScreen: React.FC<DesignerScreenProps> = ({ onStartBattle }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const { selectedUnit, handleUnitSelect } = useUnitSelection(units);
  const { handleDragStart, handleDragMove, handleDragEnd } = useUnitDrag(units, setUnits);

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

  const handleUnitModify = useCallback((unitId: number, changes: Partial<Unit>) => {
    setUnits((prevUnits) => prevUnits.map((u) => (u.id === unitId ? { ...u, ...changes } : u)));
    setContextMenuPosition(null);
  }, []);

  const handleStartBattle = useCallback(() => {
    const centerX = Math.floor(MAX_COL / 2);
    const centerY = Math.floor(MAX_ROW / 2);

    onStartBattle(
      units.map((unit) => ({
        ...unit,
        col: unit.col + centerX / 2,
        row: unit.row + centerY / 2,
      })),
    );
  }, [units, onStartBattle]);

  const handleCellClick = useCallback(
    (col: number, row: number) => {
      const clickedUnit = handleUnitSelect(col, row);
      if (clickedUnit) {
        const { x, y } = transformCoordinates(
          clickedUnit.col + clickedUnit.sizeCol / 2,
          clickedUnit.row + clickedUnit.sizeRow / 2,
        );
        setContextMenuPosition({ x, y });
      } else {
        setContextMenuPosition(null);
      }
    },
    [handleUnitSelect],
  );

  return (
    <DesignerContainer>
      <CanvasGrid
        width={DESIGN_FIELD_WIDTH}
        height={DESIGN_FIELD_HEIGHT}
        cellWidth={SOLDIER_WIDTH}
        cellHeight={SOLDIER_HEIGHT}
        units={units}
        selectedUnitId={selectedUnit?.id || null}
        onCellClick={handleCellClick}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
      />
      {contextMenuPosition && selectedUnit && (
        <ContextMenu unit={selectedUnit} position={contextMenuPosition} onModify={handleUnitModify} />
      )}
      <StartBattleButton onClick={handleStartBattle}>Start Battle</StartBattleButton>
    </DesignerContainer>
  );
};

const DesignerContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`;

const StartBattleButton = styled.button`
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
`;
