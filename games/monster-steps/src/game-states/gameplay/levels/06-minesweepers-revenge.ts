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
  const config = generateBaseConfig(10, 6, "Minesweeper's Revenge", 'Plant a surprise for your pursuers!');

  state.player = createPlayer(0, 5);
  state.goal = createPosition(9, 5);
  state.monsters = [createMonster(6, 5), createMonster(4, 8), createMonster(8, 8)];
  state.bonuses = [createBonus(2, 5, BonusType.LandMine)];

  for (let i = 4; i < 9; i++) {
    if (i !== 6) {
      state.obstacles.push(createObstacle(i, 4));
      state.obstacles.push(createObstacle(i, 6));
    }
  }

  return [state, config, config.levelStory];
};
