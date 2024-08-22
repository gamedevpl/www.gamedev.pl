import { BonusType, GameState, LevelConfig } from '../gameplay-types';
import {
  createPosition,
  createMonster,
  createObstacle,
  createPlayer,
  generateBaseState,
  generateBaseConfig,
  createBonus,
} from '../level-generator';

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(7, 'The First Step', 'Avoid the lone monster and reach the goal in 13 steps!');

  state.player = createPlayer(0, 3);
  state.goal = createPosition(6, 3);
  state.monsters = [createMonster(3, 0)];
  state.obstacles = [createObstacle(2, 3), createObstacle(5, 2), createObstacle(5, 3)];
  state.bonuses = [createBonus(1, 3, BonusType.Sokoban)];

  return [state, config, config.levelStory];
};
