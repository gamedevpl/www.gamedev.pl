import { GameState, LevelConfig, BonusType } from '../gameplay-types';
import {
  createPosition,
  createObstacle,
  createPlayer,
  createBonus,
  generateBaseState,
  generateBaseConfig,
} from '../level-generator';

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(12, 'Tunnel Vision', 'Build a path and set a trap!');

  state.player = createPlayer(0, 6);
  state.goal = createPosition(11, 6);
  state.monsters = []; // Remove initial monsters
  state.bonuses = [
    createBonus(2, 6, BonusType.Builder),
    createBonus(5, 6, BonusType.LandMine),
    createBonus(5, 5, BonusType.Sokoban),
  ];

  // Create a partial tunnel, leaving space for the player to build
  for (let i = 3; i < 10; i++) {
    if (i !== 5 && i !== 8) {
      state.obstacles.push(createObstacle(i, 5));
      state.obstacles.push(createObstacle(i, 7));
    }
  }

  // Add some obstacles to create a more interesting layout
  state.obstacles.push(createObstacle(1, 4));
  state.obstacles.push(createObstacle(1, 8));
  state.obstacles.push(createObstacle(10, 4));
  state.obstacles.push(createObstacle(10, 8));

  // Add obstacles near the goal to encourage strategic building
  state.obstacles.push(createObstacle(11, 5));
  state.obstacles.push(createObstacle(11, 7));

  config.monsterSpawnSectors = [createPosition(0, 0)];

  return [
    state,
    config,
    'Use the Builder bonus to create a path and set up a trap with the Land Mine. Be strategic about where you place your obstacles and mine to catch the spawning monsters!',
  ];
};
