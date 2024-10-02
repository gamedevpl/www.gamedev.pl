import React, { useMemo } from 'react';
import styled from 'styled-components';
import { Unit } from './designer-screen';
import { UNIT_ASSET_PATHS } from '../../js/consts';

interface ContextMenuProps {
  unit: Unit;
  position: { x: number; y: number };
  onModify: (unitId: number, changes: Partial<Pick<Unit, 'type' | 'sizeCol' | 'sizeRow'>>) => void;
  canvasSize: { width: number; height: number };
  totalUnitCount: number;
}

interface MenuOption<T extends keyof Unit> {
  label: string;
  value: Unit[T];
  imagePath?: string;
}

const typeOptions: MenuOption<'type'>[] = [
  { label: 'Archer', value: 'archer', imagePath: UNIT_ASSET_PATHS.archer },
  { label: 'Warrior', value: 'warrior', imagePath: UNIT_ASSET_PATHS.warrior },
  { label: 'Tank', value: 'tank', imagePath: UNIT_ASSET_PATHS.tank },
  { label: 'Artillery', value: 'artillery', imagePath: UNIT_ASSET_PATHS.artillery },
];

const getFormationOptions = (unitCount: number): Array<{ label: string; sizeCol: number; sizeRow: number }> => {
  const options = [
    { label: '1x1', sizeCol: 1, sizeRow: 1 },
    { label: '2x1', sizeCol: 2, sizeRow: 1 },
    { label: '1x2', sizeCol: 1, sizeRow: 2 },
  ];

  if (unitCount >= 4) {
    options.push({ label: '2x2', sizeCol: 2, sizeRow: 2 });
  }

  if (unitCount >= 8) {
    options.push({ label: '4x2', sizeCol: 4, sizeRow: 2 });
    options.push({ label: '2x4', sizeCol: 2, sizeRow: 4 });
  }

  return options;
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ unit, position, onModify, canvasSize, totalUnitCount }) => {
  const handleTypeChange = (newType: Unit['type']) => {
    onModify(unit.id, { type: newType });
  };

  const handleFormationChange = (newSizeCol: number, newSizeRow: number) => {
    onModify(unit.id, { sizeCol: newSizeCol, sizeRow: newSizeRow });
  };

  const menuStyle = useMemo(() => {
    const { x, y } = position;
    const { width, height } = canvasSize;
    const menuWidth = 200; // Adjust based on your menu's actual width
    const menuHeight = 300; // Adjust based on your menu's actual height

    let adjustedX = x;
    let adjustedY = y;

    // Ensure the menu stays within the canvas bounds
    if (x + menuWidth > width) {
      adjustedX = width - menuWidth;
    }
    if (y + menuHeight > height) {
      adjustedY = height - menuHeight;
    }

    return {
      position: 'absolute' as const,
      left: `${adjustedX}px`,
      top: `${adjustedY}px`,
      zIndex: 1000,
    };
  }, [position, canvasSize]);

  const formationOptions = useMemo(() => getFormationOptions(totalUnitCount), [totalUnitCount]);

  return (
    <MenuContainer style={menuStyle}>
      <h3>Modify Unit</h3>
      <Section>
        <h4>Type:</h4>
        <OptionGroup>
          {typeOptions.map((option) => (
            <TypeButton
              key={option.value}
              onClick={() => handleTypeChange(option.value)}
              $isSelected={unit.type === option.value}
            >
              <TypeImage src={option.imagePath} alt={option.label} />
            </TypeButton>
          ))}
        </OptionGroup>
      </Section>
      <Section>
        <h4>Formation:</h4>
        <OptionGroup>
          {formationOptions.map((option) => (
            <FormationButton
              key={`${option.sizeCol}x${option.sizeRow}`}
              onClick={() => handleFormationChange(option.sizeCol, option.sizeRow)}
              $isSelected={unit.sizeCol === option.sizeCol && unit.sizeRow === option.sizeRow}
            >
              {option.label}
            </FormationButton>
          ))}
        </OptionGroup>
      </Section>
    </MenuContainer>
  );
};

const MenuContainer = styled.div`
  background-color: rgba(255, 255, 255, 0.9);
  border: 2px solid #4a4a4a;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  color: #333;
  font-family: Arial, sans-serif;
  max-width: 250px;

  h3 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 18px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  h4 {
    margin-bottom: 10px;
    font-size: 16px;
  }
`;

const Section = styled.div`
  margin-bottom: 20px;
`;

const OptionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const Button = styled.button<{ $isSelected: boolean }>`
  cursor: pointer;
  background-color: ${(props) => (props.$isSelected ? '#4a90e2' : '#f0f0f0')};
  color: ${(props) => (props.$isSelected ? 'white' : '#333')};
  border: 1px solid #ddd;
  border-radius: 4px;
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: ${(props) => (props.$isSelected ? '#3a80d2' : '#e0e0e0')};
  }
`;

const TypeButton = styled(Button)`
  width: 50px;
  height: 50px;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TypeImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const FormationButton = styled(Button)`
  padding: 8px 12px;
  font-size: 14px;
`;