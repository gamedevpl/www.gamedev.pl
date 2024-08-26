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
  const config = generateBaseConfig(8, 2, 'Now You See Me', 'Use the invisibility cap to sneak past the monsters!');

  state.player = createPlayer(0, 4);
  state.goal = createPosition(7, 4);
  state.monsters = [createMonster(3, 2), createMonster(5, 4)];
  state.bonuses = [createBonus(2, 4, BonusType.CapOfInvisibility)];
  state.obstacles = [createObstacle(1, 3), createObstacle(1, 5), createObstacle(6, 3), createObstacle(6, 5)];

  return [state, config, config.levelStory];
};
