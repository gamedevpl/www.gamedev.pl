import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { CanvasGrid } from './canvas-grid';
import { useUnitDrag } from './hooks/unit-drag';
import { useUnitSelection } from './hooks/unit-selection';
import {
  DESIGN_FIELD_WIDTH,
  DESIGN_FIELD_HEIGHT,
  SOLDIER_WIDTH,
  SOLDIER_HEIGHT,
  MAX_COL,
  MAX_ROW,
} from '../../js/consts';
import { UnitInfoPanel } from './unit-info-panel';
import { calculatePanelPosition } from './utils/ui-utils';

export interface Unit {
  id: number;
  col: number;
  row: number;
  sizeCol: number;
  sizeRow: number;
  type: 'warrior' | 'archer' | 'tank' | 'artillery';
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
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [infoPanelPosition, setInfoPanelPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { selectedUnit, handleUnitSelect } = useUnitSelection(units);
  const { handleDragStart, handleDragMove, handleDragEnd, isDragging } = useUnitDrag(units, setUnits);

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
      handleUnitSelect(col, row);
    },
    [handleUnitSelect],
  );

  useEffect(() => {
    if (isDragging) {
      setShowInfoPanel(false);
    } else {
      if (selectedUnit && containerRef.current) {
        const position = calculatePanelPosition(
          selectedUnit,
          containerRef.current.querySelector('canvas')! as HTMLCanvasElement,
          SOLDIER_WIDTH,
          SOLDIER_HEIGHT,
        );
        setInfoPanelPosition(position);
        setShowInfoPanel(true);
      } else {
        setShowInfoPanel(false);
      }
    }
  }, [isDragging, selectedUnit]);

  return (
    <DesignerContainer ref={containerRef}>
      <CanvasGrid
        width={DESIGN_FIELD_WIDTH}
        height={DESIGN_FIELD_HEIGHT}
        cellWidth={SOLDIER_WIDTH * (DESIGN_FIELD_WIDTH / DESIGN_FIELD_WIDTH)}
        cellHeight={SOLDIER_HEIGHT * (DESIGN_FIELD_HEIGHT / DESIGN_FIELD_HEIGHT)}
        units={units}
        selectedUnitId={selectedUnit?.id || null}
        onCellClick={handleCellClick}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onModifyUnit={handleUnitModify}
      />
      {showInfoPanel && selectedUnit && (
        <UnitInfoPanel unit={selectedUnit} position={infoPanelPosition} onModifyUnit={handleUnitModify} />
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
  overflow: hidden;
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