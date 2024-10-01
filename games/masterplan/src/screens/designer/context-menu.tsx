import React, { useMemo } from 'react';
import styled from 'styled-components';
import { Unit } from './designer-screen';

interface ContextMenuProps {
  unit: Unit;
  position: { x: number; y: number };
  onModify: (unitId: number, changes: Partial<Pick<Unit, 'type' | 'command' | 'sizeCol' | 'sizeRow'>>) => void;
}

interface MenuOption<T extends keyof Unit> {
  label: string;
  value: Unit[T];
}

const commandOptions: MenuOption<'command'>[] = [
  { label: 'Wait-Advance', value: 'wait-advance' },
  { label: 'Advance', value: 'advance' },
  { label: 'Advance-Wait', value: 'advance-wait' },
  { label: 'Flank-Left', value: 'flank-left' },
  { label: 'Flank-Right', value: 'flank-right' },
];

const typeOptions: MenuOption<'type'>[] = [
  { label: 'Archer', value: 'archer' },
  { label: 'Warrior', value: 'warrior' },
  { label: 'Tank', value: 'tank' },
  { label: 'Artillery', value: 'artillery' },
];

const formationOptions: Array<{ label: string; sizeCol: number; sizeRow: number }> = [
  { label: '1x4', sizeCol: 1, sizeRow: 4 },
  { label: '2x2', sizeCol: 2, sizeRow: 2 },
  { label: '4x1', sizeCol: 4, sizeRow: 1 },
];

export const ContextMenu: React.FC<ContextMenuProps> = ({ unit, position, onModify }) => {
  const handleTypeChange = (newType: Unit['type']) => {
    onModify(unit.id, { type: newType });
  };

  const handleCommandChange = (newCommand: Unit['command']) => {
    onModify(unit.id, { command: newCommand });
  };

  const handleFormationChange = (newSizeCol: number, newSizeRow: number) => {
    onModify(unit.id, { sizeCol: newSizeCol, sizeRow: newSizeRow });
  };

  const menuStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 1000,
    }),
    [position],
  );

  return (
    <MenuContainer style={menuStyle}>
      <h3>Modify Unit</h3>
      <Section>
        <h4>Type:</h4>
        <OptionGroup>
          {typeOptions.map((option) => (
            <OptionButton
              key={option.value}
              onClick={() => handleTypeChange(option.value)}
              $isSelected={unit.type === option.value}
            >
              {option.label}
            </OptionButton>
          ))}
        </OptionGroup>
      </Section>
      <Section>
        <h4>Command:</h4>
        <OptionGroup>
          {commandOptions.map((option) => (
            <OptionButton
              key={option.value}
              onClick={() => handleCommandChange(option.value)}
              $isSelected={unit.command === option.value}
            >
              {option.label}
            </OptionButton>
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
  background-color: white;
  border: 1px solid black;
  padding: 10px;
  border-radius: 5px;
  color: black;
`;

const Section = styled.div`
  margin-bottom: 10px;
`;

const OptionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const OptionButton = styled.button<{ $isSelected: boolean }>`
  margin: 2px;
  padding: 5px 10px;
  cursor: pointer;
  background-color: ${(props) => (props.$isSelected ? 'lightblue' : 'white')};
  border: 1px solid #ccc;
  border-radius: 3px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${(props) => (props.$isSelected ? 'lightblue' : '#f0f0f0')};
  }
`;

const FormationButton = styled(OptionButton)`
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
`;
