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
  const config = generateBaseConfig(12, 'Ghost Bomber', 'Vanish, plant, and detonate!');
  
  state.player = createPlayer(0, 6);
  state.goal = createPosition(11, 6);
  state.monsters = [createMonster(3, 6), createMonster(7, 6), createMonster(10, 6)];
  state.bonuses = [
    createBonus(2, 6, BonusType.CapOfInvisibility),
    createBonus(5, 6, BonusType.TimeBomb)
  ];
  
  for (let i = 4; i < 11; i++) {
    if (i !== 5 && i !== 8) {
      state.obstacles.push(createObstacle(i, 5));
      state.obstacles.push(createObstacle(i, 7));
    }
  }
  
  return [state, config, config.levelStory];
};