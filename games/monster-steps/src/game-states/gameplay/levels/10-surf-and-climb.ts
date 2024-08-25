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
  const config = generateBaseConfig(13, 'Surf and Climb', 'Ride the wave and climb to safety!');

  state.player = createPlayer(0, 6);
  state.goal = createPosition(12, 6);
  state.monsters = [
    createMonster(4, 6),
    createMonster(8, 6),
    createMonster(11, 6),
    createMonster(6, 2),
    createMonster(6, 10),
  ];
  state.bonuses = [createBonus(2, 6, BonusType.Tsunami), createBonus(4, 4, BonusType.Climber)];

  // Create a central path with obstacles on both sides
  for (let i = 1; i < 12; i++) {
    if (i !== 2 && i !== 10) {
      // Leave space for bonuses
      state.obstacles.push(createObstacle(i, 5));
      state.obstacles.push(createObstacle(i, 7));
    }
  }

  // Create "islands" of obstacles that can be climbed
  state.obstacles.push(createObstacle(3, 6));
  state.obstacles.push(createObstacle(6, 6));
  state.obstacles.push(createObstacle(9, 6));

  // Add some obstacles near the edges
  for (let i = 0; i < 13; i += 3) {
    state.obstacles.push(createObstacle(i, 0));
    state.obstacles.push(createObstacle(i, 12));
  }

  // Add obstacles near the goal to make it challenging
  state.obstacles.push(createObstacle(11, 5));
  state.obstacles.push(createObstacle(11, 7));

  return [
    state,
    config,
    'Collect the Tsunami bonus first, then make your way to the Climber bonus. Use the Climber to get on top of an obstacle, then activate the Tsunami to wash away the monsters. Time it right to reach the goal!',
  ];
};
