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
  const config = generateBaseConfig(15, 12, 'The Gauntlet', 'Master all your skills to conquer the final challenge!');

  state.player = createPlayer(0, 7);
  state.goal = createPosition(14, 7);
  state.monsters = [
    createMonster(5, 2),
    createMonster(5, 12),
    createMonster(10, 4),
    createMonster(10, 10),
    createMonster(14, 0),
    createMonster(14, 14),
  ];
  state.bonuses = [
    createBonus(2, 7, BonusType.CapOfInvisibility),
    createBonus(4, 7, BonusType.Crusher),
    createBonus(7, 3, BonusType.TimeBomb),
    createBonus(7, 11, BonusType.LandMine),
    createBonus(10, 7, BonusType.Blaster),
    createBonus(12, 7, BonusType.Climber),
  ];

  // Create a central path with obstacles
  for (let i = 1; i < 14; i++) {
    if (i % 3 !== 1) {
      // Leave gaps for bonuses and movement
      state.obstacles.push(createObstacle(i, 6));
      state.obstacles.push(createObstacle(i, 8));
    }
  }

  // Create vertical barriers
  for (let i = 0; i < 15; i += 3) {
    if (i !== 6 && i !== 9) {
      // Leave central area open
      for (let j = 0; j < 15; j++) {
        if (j !== 7) {
          // Leave central path open
          state.obstacles.push(createObstacle(i, j));
        }
      }
    }
  }

  // Add some strategic single obstacles
  state.obstacles.push(createObstacle(3, 5));
  state.obstacles.push(createObstacle(3, 9));
  state.obstacles.push(createObstacle(7, 5));
  state.obstacles.push(createObstacle(7, 9));
  state.obstacles.push(createObstacle(11, 5));
  state.obstacles.push(createObstacle(11, 9));

  // Create a challenging area near the goal
  state.obstacles.push(createObstacle(13, 6));
  state.obstacles.push(createObstacle(13, 8));
  state.obstacles.push(createObstacle(14, 6));
  state.obstacles.push(createObstacle(14, 8));

  return [
    state,
    config,
    "This is your final test! Use all the skills you've learned to navigate through the gauntlet. Collect bonuses strategically, avoid or eliminate monsters, and make your way to the goal. Good luck!",
  ];
};
