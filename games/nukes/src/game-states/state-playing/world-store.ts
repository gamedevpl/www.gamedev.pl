import { useCallback, useState } from 'react';

import { createWorldState } from '../../world/world-state-create';
import { WorldState } from '../../world/world-state-types';
import { updateWorldState } from '../../world/world-state-updates';

export function useWorldStore(playerStateName: string) {
  const [worldState, setWorldState] = useState(() => createWorldState({ playerStateName, numberOfStates: 3 }));
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return { worldState, updateWorldState: updateWorld, setWorldState };
}
