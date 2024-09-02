import { GameState, LevelConfig, BonusType } from '../gameplay-types';
import {
  createPosition,
  createObstacle,
  createPlayer,
  createBonus,
  generateBaseState,
  generateBaseConfig,
  createMonster,
} from '../level-generator';

const LAYOUT = [
  '            ',
  '            ',
  '            ',
  '            ',
  '         ###',
  '#        ###',
  '         #  ',
  '         #  ',
  '         ###',
  '            ',
  '       #####',
  '            ',
];

export const generateLevel = (): [GameState, LevelConfig, string] => {
  const state = generateBaseState();
  const config = generateBaseConfig(12, 8, 'Tunnel Vision', 'Build a path and set a trap!');

  state.player = createPlayer(0, 6);
  state.goal = createPosition(11, 6);
  state.monsters = [createMonster(11, 11)];
  state.bonuses = [
    createBonus(1, 6, BonusType.Builder),
    createBonus(7, 5, BonusType.LandMine),
    createBonus(8, 3, BonusType.Sokoban),
  ];

  // Place obstacles based on the maze layout
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (LAYOUT[y][x] === '#') {
        state.obstacles.push(createObstacle(x, y));
      }
    }
  }

  config.monsterSpawnSectors = [createPosition(11, 11)];

  return [
    state,
    config,
    'Use the Builder bonus to create a path and set up a trap with the Land Mine. Be strategic about where you place your obstacles and mine to catch the spawning monsters!',
  ];
};
