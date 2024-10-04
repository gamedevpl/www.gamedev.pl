import React, { useState } from 'react';
import styled from 'styled-components';
import { Unit } from './designer-screen';
import { UNIT_ASSET_PATHS } from '../battle/consts';

interface UnitInfoPanelProps {
  unit: Unit;
  position: { x: number; y: number };
  onModifyUnit: (unitId: number, changes: Partial<Unit>) => void;
}

export const UnitInfoPanel: React.FC<UnitInfoPanelProps> = ({ unit, position, onModifyUnit }) => {
  const [expandedIcon, setExpandedIcon] = useState<'type' | 'formation' | null>(null);

  const handleIconClick = (iconType: 'type' | 'formation') => {
    setExpandedIcon(expandedIcon === iconType ? null : iconType);
  };

  const handleTypeChange = (newType: 'warrior' | 'archer' | 'tank' | 'artillery') => {
    onModifyUnit(unit.id, { type: newType });
    setExpandedIcon(null);
  };

  const handleFormationChange = (newFormation: { sizeCol: number; sizeRow: number }) => {
    onModifyUnit(unit.id, newFormation);
    setExpandedIcon(null);
  };

  return (
    <PanelContainer style={{ left: position.x, top: position.y }}>
      <IconWrapper onClick={() => handleIconClick('type')}>
        <UnitIcon src={UNIT_ASSET_PATHS[unit.type]} alt={unit.type} />
        {expandedIcon === 'type' && (
          <ExpandedOptions>
            {(['warrior', 'archer', 'tank', 'artillery'] as const).map((type) => (
              <OptionIcon key={type} src={UNIT_ASSET_PATHS[type]} alt={type} onClick={() => handleTypeChange(type)} />
            ))}
          </ExpandedOptions>
        )}
      </IconWrapper>
      <IconWrapper onClick={() => handleIconClick('formation')}>
        <FormationIcon>
          {unit.sizeCol}x{unit.sizeRow}
        </FormationIcon>
        {expandedIcon === 'formation' && (
          <ExpandedOptions>
            {getFormations(unit.sizeCol, unit.sizeRow).map((formation) => (
              <FormationOption
                key={`${formation.sizeCol}x${formation.sizeRow}`}
                onClick={() => handleFormationChange(formation)}
              >
                {formation.sizeCol}x{formation.sizeRow}
              </FormationOption>
            ))}
          </ExpandedOptions>
        )}
      </IconWrapper>
    </PanelContainer>
  );
};

function getFormations(_sizeCol: number, _sizeRow: number) {
  return [
    { sizeCol: 1, sizeRow: 1 },
    { sizeCol: 2, sizeRow: 1 },
    { sizeCol: 1, sizeRow: 2 },
    { sizeCol: 2, sizeRow: 2 },
    { sizeCol: 4, sizeRow: 2 },
    { sizeCol: 2, sizeRow: 4 },
  ];
}

const PanelContainer = styled.div`
  position: absolute;
  display: flex;
  gap: 10px;
  padding: 5px;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.3s ease-out;
  transform: translateX(-50%);

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

const IconWrapper = styled.div`
  position: relative;
  cursor: pointer;
`;

const UnitIcon = styled.img`
  width: 32px;
  height: 32px;
`;

const FormationIcon = styled.div`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ddd;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  color: black;
`;

const ExpandedOptions = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px;
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  z-index: 10;
  animation: expandDown 0.2s ease-out;

  @keyframes expandDown {
    from {
      opacity: 0;
      transform: scaleY(0);
    }
    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }
`;

const OptionIcon = styled.img`
  width: 24px;
  height: 24px;
  cursor: pointer;
  transition: transform 0.1s;

  &:hover {
    transform: scale(1.1);
  }
`;

const FormationOption = styled.div`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #eee;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.1s;
  color: black;

  &:hover {
    background-color: #ddd;
  }
`;
