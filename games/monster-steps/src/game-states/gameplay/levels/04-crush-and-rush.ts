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
  const config = generateBaseConfig(9, 4, 'Crush and Rush', 'Clear the path with your crushing power!');

  state.player = createPlayer(0, 4);
  state.goal = createPosition(8, 4);
  state.monsters = [createMonster(4, 4)];
  state.bonuses = [createBonus(2, 4, BonusType.Crusher)];
  state.obstacles = [
    createObstacle(8, 2),
    createObstacle(7, 2),
    createObstacle(7, 3),
    createObstacle(7, 4),
    createObstacle(7, 5),
    createObstacle(8, 5),
  ];

  for (let i = 2; i < 7; i++) {
    state.obstacles.push(createObstacle(i, 3));
    state.obstacles.push(createObstacle(i - 1, 5));
  }

  return [state, config, config.levelStory];
};
