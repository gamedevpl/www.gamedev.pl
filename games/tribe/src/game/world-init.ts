import { createEntities } from './entities/entities-update';
import { GameWorldState } from './world-types';
import { MAP_WIDTH, MAP_HEIGHT } from './world-consts';

export function initWorld(): GameWorldState {
  const initialWorldState: GameWorldState = {
    time: 0, // Start at hour 0
    entities: createEntities(),
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    generationCount: 0,
    gameOver: false,
  };

  console.log('Game world initialized:', initialWorldState);

  return initialWorldState;
}
