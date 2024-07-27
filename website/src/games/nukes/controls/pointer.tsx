import React, { createContext, useContext, useReducer } from 'react';
import { City, LaunchSite, Sector } from '../world/world-state-types';

type PointableObject = LaunchSite | City | Sector;

type PointerDispatchAction =
  | {
      type: 'move';
      x: number;
      y: number;
    }
  | {
      type: 'point' | 'unpoint';
      object: PointableObject;
    };

type Pointer = {
  x: number;
  y: number;
  pointingObjects: PointableObject[];
};

const initialPointer: Pointer = { x: 0, y: 0, pointingObjects: [] };

const pointerReducer: React.Reducer<Pointer, PointerDispatchAction> = (
  pointer: Pointer,
  action: PointerDispatchAction,
) => {
  if (action.type === 'move') {
    return { x: action.x, y: action.y, pointingObjects: pointer.pointingObjects };
  } else if (action.type === 'point' && !pointer.pointingObjects.some((object) => object.id === action.object.id)) {
    return { x: pointer.x, y: pointer.y, pointingObjects: [...pointer.pointingObjects, action.object] };
  } else if (action.type === 'unpoint' && pointer.pointingObjects.some((object) => object.id === action.object.id)) {
    return {
      x: pointer.x,
      y: pointer.y,
      pointingObjects: pointer.pointingObjects.filter((object) => object.id !== action.object.id),
    };
  } else {
    return pointer;
  }
};

const PointerContext = createContext<Pointer>(initialPointer);

const PointerDispatchContext = createContext<React.Dispatch<PointerDispatchAction>>(() => {});

export function PointerContextWrapper({ children }: { children: React.ReactNode }) {
  const [selection, reducer] = useReducer(pointerReducer, initialPointer);

  return (
    <PointerContext.Provider value={selection}>
      <PointerDispatchContext.Provider value={reducer}>{children}</PointerDispatchContext.Provider>
    </PointerContext.Provider>
  );
}

export function usePointer() {
  const pointer = useContext(PointerContext);

  return pointer;
}

export function usePointerMove() {
  const dispatch = useContext(PointerDispatchContext);
  return (x: number, y: number) => dispatch({ type: 'move', x, y });
}

export function useObjectPointer() {
  const dispatch = useContext(PointerDispatchContext);
  return [
    (object: PointableObject) => dispatch({ type: 'point', object }),
    (object: PointableObject) => dispatch({ type: 'unpoint', object }),
  ] as const;
}
