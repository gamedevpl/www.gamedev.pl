import React from 'react';
import styled from 'styled-components';
import { Unit } from '../../designer-types';
import { TerrainData } from '../../../battle/game/terrain/terrain-generator';
import { PlayerPlanArea } from './player-plan-area';
import { OppositionPlan } from '../../opposition-plan';
import { DesignerControls } from './designer-controls';
import { InfoPanelContainer } from '../info-panel-container';

interface DesignerLayoutProps {
  playerUnits: Unit[];
  oppositionUnits: Unit[];
  selectedUnit: Unit | null;
  hasInteracted: boolean;
  terrainData: TerrainData;
  isDragging: boolean;
  onCellClick: (col: number, row: number) => void;
  onDragStart: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onDragMove: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onDragEnd: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onModifyUnit: (unitId: number, changes: Partial<Unit>) => void;
  onStartBattle: () => void;
}

export const DesignerLayout: React.FC<DesignerLayoutProps> = ({
  playerUnits,
  oppositionUnits,
  selectedUnit,
  hasInteracted,
  terrainData,
  isDragging,
  onCellClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onModifyUnit,
  onStartBattle,
}) => {
  return (
    <DesignerContainer>
      <OppositionPlan units={oppositionUnits} terrainData={terrainData} hasInteracted={hasInteracted} />

      <PlayerPlanArea
        units={playerUnits}
        selectedUnitId={selectedUnit?.id || null}
        hasInteracted={hasInteracted}
        terrainData={terrainData}
        onCellClick={onCellClick}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onModifyUnit={onModifyUnit}
      />

      {!isDragging && selectedUnit && <InfoPanelContainer unit={selectedUnit} onModifyUnit={onModifyUnit} />}

      <DesignerControls onStartBattle={onStartBattle} />
    </DesignerContainer>
  );
};

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
