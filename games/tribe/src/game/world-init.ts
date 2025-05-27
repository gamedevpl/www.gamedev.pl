import {
  GameWorldState,
  Character,
  BerryBush,
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_INITIAL_AGE,
  PARTNER_INITIAL_AGE,
  INITIAL_HUNGER,
  BERRY_BUSH_INITIAL_BERRIES,
  BERRY_BUSH_MAX_BERRIES,
} from "./world-types";

export function initWorld(): GameWorldState {
  const initialPlayerId = "player-0";

  const initialPlayer: Character = {
    id: initialPlayerId,
    type: "player",
    gender: "male",
    age: PLAYER_INITIAL_AGE,
    hunger: INITIAL_HUNGER,
    position: { x: MAP_WIDTH / 2 - 50, y: MAP_HEIGHT / 2 },
    inventory: 0,
    isAlive: true,
    procreationCooldownEndsAtGameTime: 0,
    causeOfDeath: "none",
  };

  const initialPartner: Character = {
    id: "partner-0",
    type: "partner",
    gender: "female",
    age: PARTNER_INITIAL_AGE,
    hunger: INITIAL_HUNGER,
    position: { x: MAP_WIDTH / 2 + 50, y: MAP_HEIGHT / 2 },
    inventory: 0,
    isAlive: true,
    procreationCooldownEndsAtGameTime: 0,
    causeOfDeath: "none",
  };

  const initialBerryBushes: BerryBush[] = [
    {
      id: "bush-0",
      position: { x: 100, y: 100 },
      berriesAvailable: BERRY_BUSH_INITIAL_BERRIES,
      maxBerries: BERRY_BUSH_MAX_BERRIES,
      regenerationProgressHours: 0,
    },
    {
      id: "bush-1",
      position: { x: MAP_WIDTH - 100, y: 100 },
      berriesAvailable: BERRY_BUSH_INITIAL_BERRIES,
      maxBerries: BERRY_BUSH_MAX_BERRIES,
      regenerationProgressHours: 0,
    },
    {
      id: "bush-2",
      position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 100 },
      berriesAvailable: BERRY_BUSH_INITIAL_BERRIES,
      maxBerries: BERRY_BUSH_MAX_BERRIES,
      regenerationProgressHours: 0,
    },
  ];

  const initialWorldState: GameWorldState = {
    time: 0, // Start at hour 0
    characters: [initialPlayer, initialPartner],
    berryBushes: initialBerryBushes,
    generationCount: 1,
    currentPlayerId: initialPlayerId,
    gameOver: false,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
  };

  console.log("Game world initialized:", initialWorldState);

  return initialWorldState;
}
