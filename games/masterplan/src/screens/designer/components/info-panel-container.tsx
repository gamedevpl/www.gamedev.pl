import React, { useEffect, useState, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { Unit, UnitType, CommandType } from '../designer-types';
import { SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../../battle/consts';
import { calculatePanelPosition, PanelDimensions } from '../utils/ui-utils';
import { getFormations } from '../utils/plan-utils';

interface InfoPanelContainerProps {
  unit: Unit;
  onModifyUnit: (unitId: number, changes: Partial<Unit>) => void;
}

interface PanelPosition {
  x: number;
  y: number;
}

// Panel dimensions with expanded sections
const PANEL_DIMENSIONS: PanelDimensions = {
  width: 250,
  height: 320, // Base height including all sections
  expandedOptionsHeight: 150, // Additional height when options are expanded
};

export const InfoPanelContainer: React.FC<InfoPanelContainerProps> = ({ unit, onModifyUnit }) => {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Function to update panel position
  const updatePosition = useCallback(() => {
    const canvas = document.querySelector('canvas[data-is-player-area="true"]') as HTMLCanvasElement;
    if (!canvas) return;

    const newPosition = calculatePanelPosition(unit, canvas, SOLDIER_WIDTH, SOLDIER_HEIGHT, PANEL_DIMENSIONS);
    setPosition(newPosition);
  }, [unit]);

  // Initial position calculation and window resize handler
  useEffect(() => {
    updatePosition();

    const handleResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePosition]);

  // Update position when unit changes
  useEffect(() => {
    updatePosition();
  }, [unit, unit.col, unit.row, unit.sizeCol, unit.sizeRow, updatePosition]);

  const handleUnitTypeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = event.target.value as UnitType;
      onModifyUnit(unit.id, { type: newType });
    },
    [unit.id, onModifyUnit],
  );

  const handleCommandChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newCommand = event.target.value as CommandType;
      onModifyUnit(unit.id, { command: newCommand });
    },
    [unit.id, onModifyUnit],
  );

  const handleFormationChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const [sizeCol, sizeRow] = event.target.value.split('x').map((val) => parseInt(val, 10));
      onModifyUnit(unit.id, { sizeCol, sizeRow });
    },
    [unit.id, onModifyUnit],
  );

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPosition(null);
  };

  if (!position) {
    return null;
  }

  return (
    <Panel ref={panelRef} style={{ left: position.x, top: position.y }}>
      <PanelHeader>
        Unit Info
        <CloseButton onClick={handleClose}>×</CloseButton>
      </PanelHeader>

      <PanelSection>
        <Label>Type:</Label>
        <Select value={unit.type} onChange={handleUnitTypeChange}>
          <option value="warrior">Warrior</option>
          <option value="archer">Archer</option>
          <option value="tank">Tank</option>
          <option value="artillery">Artillery</option>
        </Select>
      </PanelSection>

      <PanelSection>
        <Label>Command:</Label>
        <Select value={unit.command} onChange={handleCommandChange}>
          <option value="advance-wait">Advance and Wait</option>
          <option value="advance">Advance</option>
          <option value="wait-advance">Wait then Advance</option>
          <option value="flank-left">Flank Left</option>
          <option value="flank-right">Flank Right</option>
        </Select>
      </PanelSection>

      <PanelSection>
        <Label>Fomration:</Label>
        <Select value={unit.command} onChange={handleFormationChange}>
          {getFormations(unit.sizeCol, unit.sizeRow).map((formation) => (
            <option value={`${formation.sizeCol}x${formation.sizeRow}`}>
              {formation.sizeCol}x{formation.sizeRow}
            </option>
          ))}
        </Select>
      </PanelSection>
    </Panel>
  );
};

const Panel = styled.div`
  position: absolute;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 16px;
  color: white;
  width: ${PANEL_DIMENSIONS.width}px;
  backdrop-filter: blur(5px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transition: all 0.3s ease-out;

  box-sizing: border-box;
`;

const PanelHeader = styled.h3`
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: bold;
  color: #ffd700;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const PanelSection = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: #ccc;
`;

const Select = styled.select`
  width: 100%;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  option {
    background: #333;
  }
`;
