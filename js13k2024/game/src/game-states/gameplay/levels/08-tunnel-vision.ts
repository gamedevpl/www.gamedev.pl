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
  const config = generateBaseConfig(12, 'Tunnel Vision', 'Build a path and set a trap!');
  
  state.player = createPlayer(0, 6);
  state.goal = createPosition(11, 6);
  state.monsters = [createMonster(3, 10), createMonster(8, 8)];
  state.bonuses = [
    createBonus(2, 6, BonusType.Builder),
    createBonus(2, 2, BonusType.LandMine)
  ];
  
  for (let i = 3; i < 10; i++) {
    if (i !== 6) {
      state.obstacles.push(createObstacle(i, 5));
      state.obstacles.push(createObstacle(i, 7));
    }
  }
  
  return [state, config, config.levelStory];
};