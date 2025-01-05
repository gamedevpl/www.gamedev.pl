import { Environment } from './environment-types';
import { UpdateContext } from './game-world-types';
// import { UpdateContext } from './game-world-types';

export function environmentUpdate(updateContext: UpdateContext): Environment {
  // TODO: Update the environment (e.g. grass growth)

  return updateContext.gameState.environment;
}

export function environmentInit(): Environment {
  // TODO: Create grass sectors
  // TODO: Create water sectors
  return {
    sectors: [
      {
        rect: { x: 100, y: 100, width: 100, height: 100 },
        type: 'grass',
        density: 1,
      },
      {
        rect: { x: 300, y: 300, width: 100, height: 100 },
        type: 'water',
        depth: 1,
      },
    ],
  };
}
