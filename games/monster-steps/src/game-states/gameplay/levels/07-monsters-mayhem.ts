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
  const config = generateBaseConfig(11, "Monsters' Mayhem", 'Confuse them all and make your escape!');

  state.player = createPlayer(0, 5);
  state.goal = createPosition(10, 5);
  state.monsters = [createMonster(3, 4), createMonster(3, 6), createMonster(6, 4), createMonster(6, 6)];
  state.bonuses = [createBonus(2, 5, BonusType.ConfusedMonsters)];

  for (let i = 4; i < 8; i++) {
    state.obstacles.push(createObstacle(i, 3));
    state.obstacles.push(createObstacle(i, 7));
  }

  return [state, config, config.levelStory];
};
