import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { rotateUnits, Unit } from './designer-types';
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
  const [terrainData] = useState<TerrainData>(() => {
    return generateTerrain(SOLDIER_WIDTH);
  });
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
    onStartBattle(playerUnits, await updateOppositionPlan(playerUnits), terrainData);
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
      updateOppositionPlan(playerUnits).then(setOppositionUnits);
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
      <StartBattleButton onClick={handleStartBattle}>Start Battle</StartBattleButton>
    </DesignerContainer>
  );
};

const DEFAULT_UNITS: Unit[] = rotateUnits(balancedAssault.units);

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
