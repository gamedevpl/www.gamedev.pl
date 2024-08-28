import { useCallback, useState } from 'react';

import { createWorldState } from '../../world/world-state-create';
import { WorldState } from '../../world/world-state-types';
import { updateWorldState } from '../../world/world-state-updates';

export function useWorldStore(playerStateName: string, numberOfOpponents: number, groundWarfare: boolean) {
  const [worldState, setWorldState] = useState(() =>
    createWorldState({ playerStateName, numberOfStates: numberOfOpponents + 1, groundWarfare }),
  );
  const updateWorld = useCallback(
    (worldState: WorldState, deltaTime: number) => setWorldState(updateWorldState(worldState, deltaTime)),
    [],
  );

  return { worldState, updateWorldState: updateWorld, setWorldState };
}
