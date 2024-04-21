import React, { createContext, useContext, useReducer } from 'react';

import { LaunchSite } from '../world/world-state-types';

type SelectionDispatchAction =
  | {
      action: 'clear';
    }
  | {
      action: 'set';
      object: LaunchSite;
    };

type Selection = {
  selectedObject?: LaunchSite;
};

const initialSelection: Selection = {};

const selectionReducer: React.Reducer<Selection, SelectionDispatchAction> = (
  selection: Selection,
  action: SelectionDispatchAction,
) => {
  if (action.action === 'clear') {
    return initialSelection;
  } else if (action.action === 'set') {
    return { ...selection, selectedObject: action.object };
  } else {
    return selection;
  }
};

// definition of react context for selection
const SelectionContext = createContext<Selection>(initialSelection);

// definition of dispatch function for selection context
const SelectionDispatchContext = createContext<React.Dispatch<SelectionDispatchAction>>(selectionReducer);

export function SelectionContextWrapper({ children }: { children: React.ReactNode }) {
  const [selection, reducer] = useReducer(selectionReducer, initialSelection);

  return (
    <SelectionContext.Provider value={selection}>
      <SelectionDispatchContext.Provider value={reducer}>{children}</SelectionDispatchContext.Provider>
    </SelectionContext.Provider>
  );
}

export function useObjectSelection(object: LaunchSite) {
  const dispatch = useContext(SelectionDispatchContext);
  const selection = useContext(SelectionContext);

  return [selection.selectedObject?.id === object.id, () => dispatch({ action: 'set', object })] as const;
}

export function useClearSelection() {
  const dispatch = useContext(SelectionDispatchContext);

  return () => dispatch({ action: 'clear' });
}
