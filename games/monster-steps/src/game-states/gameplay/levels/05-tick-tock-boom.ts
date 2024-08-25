import { GameState, LevelConfig, BonusType } from '../gameplay-types';
import {
  createPosition,
  createMonster,
  createObstacle,
  createPlayer,
  createBonus,
  generateBaseState,
  generateBaseConfig,
} from '../level-generator';

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(10, 'Tick Tock Boom', 'Time your bomb perfectly to clear the way!');

  state.player = createPlayer(0, 5);
  state.goal = createPosition(9, 5);
  state.monsters = [createMonster(3, 5)];
  state.bonuses = [createBonus(8, 3, BonusType.TimeBomb)];
  state.obstacles = [
    // tunnel
    createObstacle(9, 4),
    createObstacle(8, 4),
    createObstacle(8, 5),
    createObstacle(8, 6),
    createObstacle(9, 6),
    // run around this and time the bomb
    createObstacle(2, 1),
    createObstacle(3, 1),
    createObstacle(4, 1),
    createObstacle(5, 1),
    createObstacle(6, 1),
    createObstacle(7, 1),
    createObstacle(8, 1),
  ];

  for (let i = 2; i < 8; i++) {
    state.obstacles.push(createObstacle(i, 4));
    state.obstacles.push(createObstacle(i, 6));
    state.obstacles.push(createObstacle(i - 2, 8));
  }

  config.monsterSpawnSectors = [createPosition(1, 9)];

  return [state, config, config.levelStory];
};
