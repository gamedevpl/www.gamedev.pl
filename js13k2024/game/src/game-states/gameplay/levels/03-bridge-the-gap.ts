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
  const config = generateBaseConfig(9, 3, 'Bridge the Gap', 'Build your way to victory!');

  state.player = createPlayer(0, 4);
  state.goal = createPosition(8, 4);
  state.monsters = [createMonster(4, 4)];
  state.bonuses = [createBonus(2, 4, BonusType.Builder)];
  state.obstacles = [
    createObstacle(3, 3),
    createObstacle(3, 4),
    createObstacle(3, 5),
    createObstacle(5, 3),
    createObstacle(5, 4),
    createObstacle(5, 5),
  ];

  return [state, config, config.levelStory];
};
