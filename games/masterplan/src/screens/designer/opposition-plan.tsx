import React from 'react';
import styled from 'styled-components';
import { CanvasGrid } from './canvas-grid';
import { Unit } from './designer-types';
import { DESIGN_FIELD_WIDTH, DESIGN_FIELD_HEIGHT, SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../battle/consts';
import { TerrainData } from '../battle/game/terrain/terrain-generator';

interface OppositionPlanProps {
  units: Unit[];
  terrainData: TerrainData;
  hasInteracted?: boolean;
}

export const OppositionPlan: React.FC<OppositionPlanProps> = ({ units, terrainData, hasInteracted = true }) => {
  // Dummy handlers for CanvasGrid props (no interactions allowed for opposition plan)
  const dummyHandler = () => {};

  return (
    <OppositionPlanContainer>
      <CanvasGrid
        width={DESIGN_FIELD_WIDTH}
        height={DESIGN_FIELD_HEIGHT}
        cellWidth={SOLDIER_WIDTH * (DESIGN_FIELD_WIDTH / DESIGN_FIELD_WIDTH)}
        cellHeight={SOLDIER_HEIGHT * (DESIGN_FIELD_HEIGHT / DESIGN_FIELD_HEIGHT)}
        units={units}
        selectedUnitId={null}
        onCellClick={dummyHandler}
        onMouseDown={dummyHandler}
        onMouseMove={dummyHandler}
        onMouseUp={dummyHandler}
        onTouchStart={dummyHandler}
        onTouchMove={dummyHandler}
        onTouchEnd={dummyHandler}
        onModifyUnit={dummyHandler}
        isPlayerArea={false}
        terrainData={terrainData}
      />
      {!hasInteracted && (
        <OppositionOverlay>
          <OverlayText>Enemy battle plan</OverlayText>
        </OppositionOverlay>
      )}
    </OppositionPlanContainer>
  );
};

const OppositionPlanContainer = styled.div`
  width: 100%;
  height: 50%;
  position: relative;
`;

const OppositionOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
`;

const OverlayText = styled.div`
  color: white;
  font-size: 24px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.7);
  padding: 16px 32px;
  border-radius: 8px;
`;
