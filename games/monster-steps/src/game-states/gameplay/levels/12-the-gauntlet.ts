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

const GRID_SIZE = 15;

// Pre-designed maze layout
const MAZE_LAYOUT = [
  '###############',
  '#S  #     #   #',
  '# # # ### # # #',
  '# #   #   #   #',
  '# ##### #### #',
  '#     # #    #',
  '##### # # ####',
  '#   #   #    #',
  '# # ####### ###',
  '# #       # # #',
  '# ####### # # #',
  '#       # # # #',
  '####### # # # #',
  '#         # #  ',
  '############# G',
];

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(
    GRID_SIZE,
    12,
    'Maze of Challenges',
    'Navigate through a treacherous maze using your wit and special abilities!',
  );

  // Place obstacles based on the maze layout
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (MAZE_LAYOUT[y][x] === '#') {
        state.obstacles.push(createObstacle(x, y));
      }
    }
  }

  // Place player at the start
  const startPos = findPosition('S');
  state.player = createPlayer(startPos.x, startPos.y);

  // Place goal at the end
  const goalPos = findPosition('G');
  state.goal = createPosition(goalPos.x, goalPos.y);

  // Place bonuses
  state.bonuses = [
    createBonus(1, 5, BonusType.Teleport),
    createBonus(13, 1, BonusType.Climber),
    createBonus(7, 9, BonusType.Sokoban),
    createBonus(2, 13, BonusType.Blaster),
    createBonus(1, 13, BonusType.Teleport), // Added second Teleport bonus close to the Blaster
  ];

  // Place monsters at key junctions
  state.monsters = [createMonster(5, 5), createMonster(9, 9), createMonster(12, 5), createMonster(6, 13)];

  return [
    state,
    config,
    'Welcome to the Maze of Challenges! Your goal is to navigate through this treacherous maze and reach the exit. ' +
      'Use your special abilities wisely: Teleport past obstacles (now with two Teleport bonuses!), Climb over walls, Push blocks with Sokoban power, ' +
      'and Blast through certain walls. The second Teleport bonus is placed near the Blaster for strategic use. ' +
      'Be cautious of the monsters guarding key junctions. Good luck, adventurer!',
  ];
};

// Helper function to find a position of a character in the maze layout
function findPosition(char: string): { x: number; y: number } {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (MAZE_LAYOUT[y][x] === char) {
        return { x, y };
      }
    }
  }
  throw new Error(`Character ${char} not found in maze layout`);
}
