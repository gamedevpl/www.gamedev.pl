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
  const config = generateBaseConfig(16, 'The Final Countdown', 'Can you outsmart them all?');
  
  state.player = createPlayer(0, 8);
  state.goal = createPosition(15, 8);
  state.monsters = [
    createMonster(5, 8),
    createMonster(6, 8),
    createMonster(9, 8),
    createMonster(12, 8),
    createMonster(8, 3),
    createMonster(8, 13),
    createMonster(15, 3),
    createMonster(15, 13),
  ];
  state.bonuses = [
    createBonus(2, 8, BonusType.CapOfInvisibility),
    createBonus(5, 8, BonusType.TimeBomb),
    createBonus(8, 8, BonusType.LandMine),
    createBonus(11, 1, BonusType.Crusher),
    createBonus(14, 14, BonusType.ConfusedMonsters),
  ];
  
  for (let i = 4; i < 15; i++) {
    if (i !== 5 && i !== 8 && i !== 11 && i !== 14) {
      state.obstacles.push(createObstacle(i, 7));
      state.obstacles.push(createObstacle(i, 9));
    }
  }
  
  for (let i = 4; i < 13; i++) {
    if (i !== 8) {
      state.obstacles.push(createObstacle(7, i));
      state.obstacles.push(createObstacle(9, i));
    }
  }
  
  state.obstacles.push(createObstacle(14, 8));
  
  return [state, config, config.levelStory];
};