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
  const config = generateBaseConfig(13, 'Crush, Confuse, Conquer', 'A symphony of chaos!');
  
  state.player = createPlayer(0, 6);
  state.goal = createPosition(12, 6);
  state.monsters = [createMonster(4, 6), createMonster(8, 6), createMonster(11, 6)];
  state.bonuses = [
    createBonus(2, 6, BonusType.Crusher),
    createBonus(6, 6, BonusType.ConfusedMonsters)
  ];
  
  for (let i = 3; i < 12; i++) {
    if (i !== 6 && i !== 9) {
      state.obstacles.push(createObstacle(i, 5));
      state.obstacles.push(createObstacle(i, 7));
    }
  }
  
  return [state, config, config.levelStory];
};