import React from 'react';
import styled from 'styled-components';
import { Unit } from '../../designer-types';
import { TerrainData } from '../../../battle/game/terrain/terrain-generator';
import { CanvasGrid } from '../../canvas-grid';
import { DESIGN_FIELD_WIDTH, DESIGN_FIELD_HEIGHT, SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../../../battle/consts';

interface PlayerPlanAreaProps {
  units: Unit[];
  selectedUnitId: number | null;
  hasInteracted: boolean;
  terrainData: TerrainData;
  onCellClick: (col: number, row: number) => void;
  onDragStart: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onDragMove: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onDragEnd: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onModifyUnit: (unitId: number, changes: Partial<Unit>) => void;
}

export const PlayerPlanArea: React.FC<PlayerPlanAreaProps> = ({
  units,
  selectedUnitId,
  hasInteracted,
  terrainData,
  onCellClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onModifyUnit,
}) => {
  return (
    <Container>
      <CanvasGrid
        isPlayerArea={true}
        width={DESIGN_FIELD_WIDTH}
        height={DESIGN_FIELD_HEIGHT}
        cellWidth={SOLDIER_WIDTH * (DESIGN_FIELD_WIDTH / DESIGN_FIELD_WIDTH)}
        cellHeight={SOLDIER_HEIGHT * (DESIGN_FIELD_HEIGHT / DESIGN_FIELD_HEIGHT)}
        units={units}
        selectedUnitId={selectedUnitId}
        onCellClick={onCellClick}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
        onModifyUnit={onModifyUnit}
        terrainData={terrainData}
      />
      {!hasInteracted && <EditableAreaOverlay />}
    </Container>
  );
};

const Container = styled.div`
  flex: 1;
  position: relative;
`;

const EditableAreaOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  animation: pulse 2s infinite;

  &::after {
    content: 'Click or drag units to edit your battle plan';
    color: white;
    font-size: 24px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    background: rgba(0, 0, 0, 0.7);
    padding: 16px 32px;
    border-radius: 8px;
  }

  @keyframes pulse {
    0% {
      background: rgba(255, 255, 255, 0.1);
    }
    50% {
      background: rgba(255, 255, 255, 0.2);
    }
    100% {
      background: rgba(255, 255, 255, 0.1);
    }
  }
`;
