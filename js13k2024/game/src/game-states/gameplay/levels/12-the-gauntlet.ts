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
  const config = generateBaseConfig(15, 'The Gauntlet', "Use everything you've learned!");
  
  state.player = createPlayer(0, 7);
  state.goal = createPosition(14, 7);
  state.monsters = [
    createMonster(3, 7),
    createMonster(6, 7),
    createMonster(9, 7),
    createMonster(12, 7),
    createMonster(7, 3),
    createMonster(7, 11),
  ];
  state.bonuses = [
    createBonus(2, 7, BonusType.LandMine),
    createBonus(2, 8, BonusType.CapOfInvisibility),
    createBonus(5, 7, BonusType.Crusher),
    createBonus(8, 7, BonusType.ConfusedMonsters),
    createBonus(1, 6, BonusType.Builder),
    createBonus(2, 6, BonusType.TimeBomb),
  ];
  
  for (let i = 4; i < 14; i++) {
    if (i !== 5 && i !== 8 && i !== 11) {
      state.obstacles.push(createObstacle(i, 6));
      state.obstacles.push(createObstacle(i, 8));
    }
  }
  
  for (let i = 4; i < 11; i++) {
    if (i !== 7) {
      state.obstacles.push(createObstacle(6, i));
      state.obstacles.push(createObstacle(8, i));
    }
  }
  
  return [state, config, config.levelStory];
};