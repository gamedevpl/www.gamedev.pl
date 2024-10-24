import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styled from 'styled-components';
import { useDebounce } from 'react-use';
import { CanvasGrid } from './canvas-grid';
import { useUnitDrag } from './hooks/unit-drag';
import { useUnitSelection } from './hooks/unit-selection';
import { useOppositionAI } from './hooks/use-opposition-ai';
import { DESIGN_FIELD_WIDTH, DESIGN_FIELD_HEIGHT, SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../battle/consts';
import { UnitInfoPanel } from './unit-info-panel';
import { calculatePanelPosition } from './utils/ui-utils';
import { OppositionPlan } from './opposition-plan';
import { rotateUnits, Unit, CommandType } from './designer-types';
import { balancedAssault } from './plans';
import { generateTerrain, TerrainData } from '../battle/game/terrain/terrain-generator';

interface DesignerScreenProps {
  onStartBattle: (playerUnits: Unit[], oppositionUnits: Unit[], terrainData: TerrainData) => void;
  initialPlayerUnits?: Unit[];
}

export const DesignerScreen: React.FC<DesignerScreenProps> = ({ onStartBattle, initialPlayerUnits }) => {
  const [playerUnits, setPlayerUnits] = useState<Unit[]>([]);
  const [oppositionUnits, setOppositionUnits] = useState<Unit[]>([]);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [infoPanelPosition, setInfoPanelPosition] = useState({ x: 0, y: 0 });
  const terrainData = useMemo<TerrainData>(() => {
    return generateTerrain(SOLDIER_WIDTH);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);

  const { selectedUnit, handleUnitSelect, setSelectedUnit } = useUnitSelection(playerUnits);
  const { handleDragStart, handleDragMove, handleDragEnd, isDragging } = useUnitDrag(playerUnits, setPlayerUnits);
  const { generateOppositionPlan, updateOppositionPlan } = useOppositionAI();

  useEffect(() => {
    setPlayerUnits(initialPlayerUnits ?? DEFAULT_UNITS);

    // Generate initial opposition plan
    setOppositionUnits(generateOppositionPlan());
  }, []);

  const handleUnitModify = useCallback((unitId: number, changes: Partial<Unit>) => {
    setPlayerUnits((prevUnits) => prevUnits.map((u) => (u.id === unitId ? { ...u, ...changes } : u)));
    setSelectedUnit((prevUnit) => (prevUnit?.id === unitId ? { ...prevUnit, ...changes } : prevUnit));
  }, []);

  const handleStartBattle = useCallback(async () => {
    onStartBattle(playerUnits, await updateOppositionPlan(playerUnits, terrainData), terrainData);
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
      updateOppositionPlan(playerUnits, terrainData).then(setOppositionUnits);
    },
    1000,
    [playerUnits],
  );

  return (
    <DesignerContainer ref={containerRef}>
      <OppositionPlan units={oppositionUnits} terrainData={terrainData} />
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
          terrainData={terrainData}
        />
      </PlayerPlanContainer>
      {showInfoPanel && selectedUnit && (
        <UnitInfoPanel unit={selectedUnit} position={infoPanelPosition} onModifyUnit={handleUnitModify} />
      )}
      <DesignerControls>
        <StartBattleButton onClick={handleStartBattle}>Start Battle</StartBattleButton>
      </DesignerControls>
    </DesignerContainer>
  );
};

const DEFAULT_UNITS: Unit[] = rotateUnits(
  balancedAssault.units.map((unit) => ({
    ...unit,
    command: 'advance-wait' as CommandType, // Set a default command
  })),
);

const DesignerContainer = styled.div`
  position: relative;
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

const DesignerControls = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: all;
`;

const StartBattleButton = styled.button`
  padding: 8px 16px;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`;
