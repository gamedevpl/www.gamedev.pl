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
  const config = generateBaseConfig(14, 11, 'Slide and Blast', 'Slide through danger and blast your way to victory!');

  state.player = createPlayer(0, 0);
  state.goal = createPosition(13, 13);
  state.monsters = [
    createMonster(3, 3),
    createMonster(10, 10),
    createMonster(6, 7),
    createMonster(7, 6),
    createMonster(13, 0),
  ];
  state.bonuses = [createBonus(0, 2, BonusType.Blaster), createBonus(0, 13, BonusType.Slide)];

  // Create a maze-like structure
  for (let i = 2; i < 12; i += 3) {
    for (let j = 0; j < 14; j++) {
      if (j !== 7) {
        // Leave a gap in the middle
        state.obstacles.push(createObstacle(i, j));
      }
    }
  }

  // Create a path that requires sliding
  state.obstacles.push(createObstacle(12, 1));
  state.obstacles.push(createObstacle(12, 2));
  state.obstacles.push(createObstacle(11, 1));

  // Obstacles useful for sliding
  state.obstacles.push(createObstacle(0, 6));

  // Add some strategic single obstacles
  state.obstacles.push(createObstacle(1, 1));
  state.obstacles.push(createObstacle(4, 4));
  state.obstacles.push(createObstacle(9, 9));
  state.obstacles.push(createObstacle(12, 10));

  return [
    state,
    config,
    'Navigate to the Slide bonus to quickly traverse the level. Then, collect the Blaster to destroy the wall blocking your path to the goal. Watch out for monsters and use your bonuses strategically!',
  ];
};
