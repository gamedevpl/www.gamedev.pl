import { useState, useCallback } from 'react';
import { Unit } from '../designer-screen';
import { inverseTransformCoordinates, transformCoordinates } from '../utils/coordinate-transforms';
import { MAX_COL, MAX_ROW, GRID_CENTER_X, GRID_CENTER_Y } from '../../../js/consts';

interface DragState {
  isDragging: boolean;
  draggedUnit: Unit | null;
  dragOffset: { x: number; y: number };
}

export const useUnitDrag = (units: Unit[], setUnits: React.Dispatch<React.SetStateAction<Unit[]>>) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedUnit: null,
    dragOffset: { x: 0, y: 0 },
  });

  const handleDragStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const { col, row } = inverseTransformCoordinates(
        (e.clientX - rect.left) * (canvas.width / rect.width),
        (e.clientY - rect.top) * (canvas.height / rect.height),
      );

      const clickedUnit = units.find(
        (unit) => col >= unit.col && col < unit.col + unit.sizeCol && row >= unit.row && row < unit.row + unit.sizeRow,
      );

      if (clickedUnit) {
        setDragState({
          isDragging: true,
          draggedUnit: clickedUnit,
          dragOffset: {
            x:
              e.clientX -
              rect.left -
              transformCoordinates(clickedUnit.col, clickedUnit.row).x / (canvas.width / rect.width),
            y:
              e.clientY -
              rect.top -
              transformCoordinates(clickedUnit.col, clickedUnit.row).y / (canvas.height / rect.height),
          },
        });
      }
    },
    [units],
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragState.isDragging && dragState.draggedUnit) {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const { col, row } = inverseTransformCoordinates(
          (e.clientX - rect.left) * (canvas.width / rect.width) - dragState.dragOffset.x,
          (e.clientY - rect.top) * (canvas.height / rect.height) - dragState.dragOffset.y,
        );

        setUnits((prevUnits) =>
          prevUnits.map((u) =>
            u.id === dragState.draggedUnit!.id
              ? {
                  ...u,
                  col: Math.max(-GRID_CENTER_X, Math.min(col, MAX_COL - GRID_CENTER_X - u.sizeCol)),
                  row: Math.max(-GRID_CENTER_Y, Math.min(row, MAX_ROW - GRID_CENTER_Y - u.sizeRow)),
                }
              : u,
          ),
        );
      }
    },
    [dragState, setUnits],
  );

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedUnit: null,
      dragOffset: { x: 0, y: 0 },
    });
  }, []);

  return {
    isDragging: dragState.isDragging,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
};
