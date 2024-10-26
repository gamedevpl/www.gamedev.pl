import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from 'react-use';
import { SOLDIER_WIDTH } from '../battle/consts';
import { rotateUnits, Unit, CommandType } from './designer-types';
import { balancedAssault } from './plans';
import { generateTerrain, TerrainData } from '../battle/game/terrain/terrain-generator';
import { DesignerLayout } from './components/layout/designer-layout';
import { useUnitDrag } from './hooks/unit-drag';
import { useUnitSelection } from './hooks/unit-selection';
import { useOppositionAI } from './hooks/use-opposition-ai';

interface DesignerScreenProps {
  onStartBattle: (playerUnits: Unit[], oppositionUnits: Unit[], terrainData: TerrainData) => void;
  initialPlayerUnits?: Unit[];
}

const DEFAULT_UNITS: Unit[] = rotateUnits(
  balancedAssault.units.map((unit) => ({
    ...unit,
    command: 'advance-wait' as CommandType,
  })),
);

export const DesignerScreen: React.FC<DesignerScreenProps> = ({ onStartBattle, initialPlayerUnits }) => {
  const [playerUnits, setPlayerUnits] = useState<Unit[]>([]);
  const [oppositionUnits, setOppositionUnits] = useState<Unit[]>([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const terrainData = useMemo<TerrainData>(() => {
    return generateTerrain(SOLDIER_WIDTH);
  }, []);

  const { selectedUnit, handleUnitSelect, setSelectedUnit } = useUnitSelection(playerUnits);
  const { handleDragStart, handleDragMove, handleDragEnd, isDragging } = useUnitDrag(playerUnits, setPlayerUnits);
  const { generateOppositionPlan, updateOppositionPlan } = useOppositionAI();

  useEffect(() => {
    setPlayerUnits(initialPlayerUnits ?? DEFAULT_UNITS);
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
      setHasInteracted(true);
      handleUnitSelect(col, row);
    },
    [handleUnitSelect],
  );

  const handlePlayerDragStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      setHasInteracted(true);
      handleDragStart(e);
    },
    [handleDragStart],
  );

  useDebounce(
    () => {
      updateOppositionPlan(playerUnits, terrainData).then(setOppositionUnits);
    },
    1000,
    [playerUnits],
  );

  return (
    <DesignerLayout
      playerUnits={playerUnits}
      oppositionUnits={oppositionUnits}
      selectedUnit={selectedUnit}
      hasInteracted={hasInteracted}
      terrainData={terrainData}
      isDragging={isDragging}
      onCellClick={handleCellClick}
      onDragStart={handlePlayerDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onModifyUnit={handleUnitModify}
      onStartBattle={handleStartBattle}
    />
  );
};
