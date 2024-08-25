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
  state.monsters = [createMonster(3, 1), createMonster(7, 11), createMonster(10, 3)]; // Monsters are now further away from the player's starting position
  state.bonuses = [
    createBonus(2, 6, BonusType.CapOfInvisibility),
    createBonus(9, 6, BonusType.TimeBomb),
    createBonus(7, 4, BonusType.CapOfInvisibility),
  ]; // Invisibility is closer to start, bomb is closer to goal

  // Create a maze-like structure
  for (let i = 2; i < 11; i += 2) {
    for (let j = 1; j < 12; j += 2) {
      if (!(i === 10 && j === 5) && !(i === 10 && j === 7)) {
        // Leave space for goal
        state.obstacles.push(createObstacle(i, j));
      }
    }
  }

  // Surround the goal with obstacles
  state.obstacles.push(createObstacle(11, 5));
  state.obstacles.push(createObstacle(10, 6));
  state.obstacles.push(createObstacle(11, 7));
  state.obstacles.push(createObstacle(10, 8));

  // Add some strategic obstacles
  state.obstacles.push(createObstacle(1, 3));
  state.obstacles.push(createObstacle(1, 9));
  state.obstacles.push(createObstacle(5, 6));
  state.obstacles.push(createObstacle(8, 4));
  state.obstacles.push(createObstacle(8, 8));

  return [
    state,
    config,
    'Use your invisibility wisely to sneak past the monsters and reach the time bomb. Then, strategically place and detonate the bomb to clear a path to the goal!',
  ];
};
