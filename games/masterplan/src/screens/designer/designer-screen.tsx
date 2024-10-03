import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useDebounce } from 'react-use';
import { CanvasGrid } from './canvas-grid';
import { useUnitDrag } from './hooks/unit-drag';
import { useUnitSelection } from './hooks/unit-selection';
import { useOppositionAI } from './hooks/use-opposition-ai';
import { DESIGN_FIELD_WIDTH, DESIGN_FIELD_HEIGHT, SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../../js/consts';
import { UnitInfoPanel } from './unit-info-panel';
import { calculatePanelPosition } from './utils/ui-utils';
import { OppositionPlan } from './opposition-plan';

export interface Unit {
  id: number;
  col: number;
  row: number;
  sizeCol: number;
  sizeRow: number;
  type: 'warrior' | 'archer' | 'tank' | 'artillery';
  command: string;
}

const centerAroundZero = (units: Unit[], direction: 1 | -1): Unit[] => {
  // const centerX = Math.floor(MAX_COL / 2);
  // const centerY = Math.floor(MAX_ROW / 2);
  return units.map((unit) => ({
    ...unit,
    col: unit.col * direction,
    row: unit.row * direction,
  }));
};

interface DesignerScreenProps {
  onStartBattle: (playerUnits: Unit[], oppositionUnits: Unit[]) => void;
  initialPlayerUnits?: Unit[];
}

export const DesignerScreen: React.FC<DesignerScreenProps> = ({ onStartBattle, initialPlayerUnits }) => {
  const [playerUnits, setPlayerUnits] = useState<Unit[]>([]);
  const [oppositionUnits, setOppositionUnits] = useState<Unit[]>([]);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [infoPanelPosition, setInfoPanelPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { selectedUnit, handleUnitSelect } = useUnitSelection(playerUnits);
  const { handleDragStart, handleDragMove, handleDragEnd, isDragging } = useUnitDrag(playerUnits, setPlayerUnits);
  const { generateOppositionPlan, updateOppositionPlan } = useOppositionAI();

  useEffect(() => {
    setPlayerUnits(centerAroundZero(initialPlayerUnits ?? DEFAULT_UNITS, 1));

    // Generate initial opposition plan
    setOppositionUnits(centerAroundZero(generateOppositionPlan(), -1));
  }, []);

  const handleUnitModify = useCallback((unitId: number, changes: Partial<Unit>) => {
    setPlayerUnits((prevUnits) => prevUnits.map((u) => (u.id === unitId ? { ...u, ...changes } : u)));
  }, []);

  const handleStartBattle = useCallback(() => {
    onStartBattle(playerUnits, updateOppositionPlan(playerUnits));
  }, [playerUnits, oppositionUnits, onStartBattle]);

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
          containerRef.current.querySelector('canvas[data-is-player-area="true"]')! as HTMLCanvasElement,
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

  useDebounce(
    () => {
      updateOppositionPlan(playerUnits);
    },
    1000,
    [playerUnits],
  );

  return (
    <DesignerContainer ref={containerRef}>
      <OppositionPlan units={oppositionUnits} />
      <PlayerPlanContainer>
        <CanvasGrid
          isPlayerArea={true}
          width={DESIGN_FIELD_WIDTH}
          height={DESIGN_FIELD_HEIGHT}
          cellWidth={SOLDIER_WIDTH * (DESIGN_FIELD_WIDTH / DESIGN_FIELD_WIDTH)}
          cellHeight={SOLDIER_HEIGHT * (DESIGN_FIELD_HEIGHT / DESIGN_FIELD_HEIGHT)}
          units={playerUnits}
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
      </PlayerPlanContainer>
      {showInfoPanel && selectedUnit && (
        <UnitInfoPanel unit={selectedUnit} position={infoPanelPosition} onModifyUnit={handleUnitModify} />
      )}
      <StartBattleButton onClick={handleStartBattle}>Start Battle</StartBattleButton>
    </DesignerContainer>
  );
};

const DEFAULT_UNITS: Unit[] = [
  { id: 1, col: -12, row: -10, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 2, col: 0, row: -10, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 3, col: 12, row: -10, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 4, col: -8, row: -7, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 5, col: 8, row: -7, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 6, col: -10, row: -2, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 7, col: 10, row: -2, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 8, col: 0, row: -1, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait-advance' },
];

const DesignerContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const PlayerPlanContainer = styled.div`
  flex: 1;
  position: relative;
`;

const StartBattleButton = styled.button`
  position: absolute;
  bottom: 20px;
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
