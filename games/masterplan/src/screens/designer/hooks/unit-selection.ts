import { useState, useCallback } from 'react';
import { Unit } from '../designer-screen';

export const useUnitSelection = (units: Unit[]) => {
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const handleUnitSelect = useCallback(
    (col: number, row: number) => {
      const clickedUnit = units.find(
        (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
      );

      setSelectedUnit(clickedUnit || null);
      return clickedUnit;
    },
    [units],
  );

  const clearSelection = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  return {
    selectedUnit,
    handleUnitSelect,
    setSelectedUnit,
    clearSelection,
  };
};
