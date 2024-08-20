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
  const config = generateBaseConfig(14, 'The Triple Threat', 'Build, Bomb, and Vanish!');
  
  state.player = createPlayer(0, 7);
  state.goal = createPosition(13, 7);
  state.monsters = [createMonster(3, 7), createMonster(6, 7), createMonster(9, 7), createMonster(12, 7)];
  state.bonuses = [
    createBonus(2, 7, BonusType.Builder),
    createBonus(5, 7, BonusType.TimeBomb),
    createBonus(8, 7, BonusType.CapOfInvisibility),
  ];
  
  for (let i = 4; i < 13; i++) {
    if (i !== 5 && i !== 8 && i !== 11) {
      state.obstacles.push(createObstacle(i, 6));
      state.obstacles.push(createObstacle(i, 8));
    }
  }
  
  return [state, config, config.levelStory];
};