import { useState, useCallback } from 'react';
import { Unit } from '../designer-screen';
import { inverseTransformCoordinates, transformCoordinates } from '../utils/coordinate-transforms';
import { MAX_COL, MAX_ROW, GRID_CENTER_X, GRID_CENTER_Y } from '../../../js/consts';

interface DragState {
  isDragging: boolean;
  draggedUnit: Unit | null;
  dragOffset: { x: number; y: number };
}

type DragEvent = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>;

export const useUnitDrag = (units: Unit[], setUnits: React.Dispatch<React.SetStateAction<Unit[]>>) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedUnit: null,
    dragOffset: { x: 0, y: 0 },
  });

  const getEventCoordinates = useCallback((e: DragEvent): { clientX: number; clientY: number } => {
    if ('touches' in e) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  }, []);

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const { clientX, clientY } = getEventCoordinates(e);
      const { col, row } = inverseTransformCoordinates(
        (clientX - rect.left) * (canvas.width / rect.width),
        (clientY - rect.top) * (canvas.height / rect.height),
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
              clientX -
              rect.left -
              transformCoordinates(clickedUnit.col, clickedUnit.row).x / (canvas.width / rect.width),
            y:
              clientY -
              rect.top -
              transformCoordinates(clickedUnit.col, clickedUnit.row).y / (canvas.height / rect.height),
          },
        });
      }
    },
    [units, getEventCoordinates],
  );

  const handleDragMove = useCallback(
    (e: DragEvent) => {
      if (dragState.isDragging && dragState.draggedUnit) {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const { clientX, clientY } = getEventCoordinates(e);
        const { col, row } = inverseTransformCoordinates(
          (clientX - rect.left) * (canvas.width / rect.width) - dragState.dragOffset.x,
          (clientY - rect.top) * (canvas.height / rect.height) - dragState.dragOffset.y,
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
    [dragState, setUnits, getEventCoordinates],
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