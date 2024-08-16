import { GameState, LevelConfig, Position, BonusType, Monster } from './gameplay-types';

const createPosition = (x: number, y: number): Position => ({ x, y });

const createBonus = (x: number, y: number, type: BonusType) => ({
  position: createPosition(x, y),
  type,
});

const createMonster = (x: number, y: number): Monster => ({
  position: createPosition(x, y),
  path: [],
});

const generateBaseState = (): GameState => ({
  playerPosition: createPosition(0, 0),
  goal: createPosition(0, 0),
  obstacles: [],
  monsters: [],
  steps: 0,
  monsterSpawnSteps: 0,
  bonuses: [],
  activeBonuses: [],
  explosions: [],
  timeBombs: [],
  landMines: [],
  crusherActive: false,
  builderActive: false,
  score: 0,
  isLevelComplete: false,
  isGameOver: false,
});

const generateBaseConfig = (width: number, height: number, levelName: string, levelStory: string): LevelConfig => ({
  gridSize: { width, height },
  initialMonsterCount: 0,
  obstacleCount: 0,
  initialBonusCount: 0,
  levelName,
  levelStory,
});

const levels: { [key: number]: () => [GameState, LevelConfig, string] } = {
  1: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(7, 7, 'The First Step', 'Avoid the lone monster and reach the goal in 13 steps!');
    state.playerPosition = createPosition(0, 3);
    state.goal = createPosition(6, 3);
    state.monsters = [createMonster(3, 0)];
    state.obstacles = [createPosition(5, 2), createPosition(5, 3)];
    return [state, config, config.levelStory];
  },
  2: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(8, 8, 'Now You See Me', 'Use the invisibility cap to sneak past the monsters!');
    state.playerPosition = createPosition(0, 4);
    state.goal = createPosition(7, 4);
    state.monsters = [createMonster(3, 2), createMonster(5, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.CapOfInvisibility)];
    state.obstacles = [createPosition(1, 3), createPosition(1, 5), createPosition(6, 3), createPosition(6, 5)];
    return [state, config, config.levelStory];
  },
  3: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(9, 9, 'Bridge the Gap', 'Build your way to victory!');
    state.playerPosition = createPosition(0, 4);
    state.goal = createPosition(8, 4);
    state.monsters = [createMonster(4, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.Builder)];
    state.obstacles = [
      createPosition(3, 3),
      createPosition(3, 4),
      createPosition(3, 5),
      createPosition(5, 3),
      createPosition(5, 4),
      createPosition(5, 5),
    ];
    return [state, config, config.levelStory];
  },
  4: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(9, 9, 'Crush and Rush', 'Clear the path with your crushing power!');
    state.playerPosition = createPosition(0, 4);
    state.goal = createPosition(8, 4);
    state.monsters = [createMonster(4, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.Crusher)];
    state.obstacles = [
      createPosition(8, 2),
      createPosition(7, 2),
      createPosition(7, 3),
      createPosition(7, 4),
      createPosition(8, 4),
    ];
    for (let i = 2; i < 7; i++) {
      state.obstacles.push(createPosition(i, 3));
      state.obstacles.push(createPosition(i - 1, 5));
    }
    return [state, config, config.levelStory];
  },
  5: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(10, 10, 'Tick Tock Boom', 'Time your bomb perfectly to clear the way!');
    state.playerPosition = createPosition(0, 5);
    state.goal = createPosition(9, 5);
    state.monsters = [createMonster(3, 5)];
    state.bonuses = [createBonus(9, 3, BonusType.TimeBomb)];
    state.obstacles = [
      // tunnel
      createPosition(9, 4),
      createPosition(8, 4),
      createPosition(8, 5),
      createPosition(8, 6),
      createPosition(9, 6),
      // run around this and time the bomb
      createPosition(4, 1),
      createPosition(5, 1),
      createPosition(6, 1),
      createPosition(7, 1),
      createPosition(8, 1),
    ];
    for (let i = 2; i < 8; i++) {
      state.obstacles.push(createPosition(i, 4));
      state.obstacles.push(createPosition(i, 6));
      state.obstacles.push(createPosition(i - 2, 8));
    }
    return [state, config, config.levelStory];
  },
  6: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(10, 10, "Minesweeper's Revenge", 'Plant a surprise for your pursuers!');
    state.playerPosition = createPosition(0, 5);
    state.goal = createPosition(9, 5);
    state.monsters = [createMonster(6, 5), createMonster(4, 8), createMonster(8, 8)];
    state.bonuses = [createBonus(2, 5, BonusType.LandMine)];
    for (let i = 4; i < 9; i++) {
      if (i !== 6) {
        state.obstacles.push(createPosition(i, 4));
        state.obstacles.push(createPosition(i, 6));
      }
    }
    return [state, config, config.levelStory];
  },
  7: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(11, 11, "Monsters' Mayhem", 'Confuse them all and make your escape!');
    state.playerPosition = createPosition(0, 5);
    state.goal = createPosition(10, 5);
    state.monsters = [
      createMonster(3, 4),
      createMonster(3, 6),
      createMonster(6, 4),
      createMonster(6, 6),
      createMonster(9, 5),
    ];
    state.bonuses = [createBonus(2, 5, BonusType.ConfusedMonsters)];
    for (let i = 4; i < 8; i++) {
      state.obstacles.push(createPosition(i, 3));
      state.obstacles.push(createPosition(i, 7));
    }
    return [state, config, config.levelStory];
  },
  8: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(12, 12, 'Tunnel Vision', 'Build a path and set a trap!');
    state.playerPosition = createPosition(0, 6);
    state.goal = createPosition(11, 6);
    state.monsters = [createMonster(3, 10), createMonster(8, 8)];
    state.bonuses = [createBonus(2, 6, BonusType.Builder), createBonus(2, 2, BonusType.LandMine)];
    for (let i = 3; i < 10; i++) {
      if (i !== 6) {
        state.obstacles.push(createPosition(i, 5));
        state.obstacles.push(createPosition(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  9: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(12, 12, 'Ghost Bomber', 'Vanish, plant, and detonate!');
    state.playerPosition = createPosition(0, 6);
    state.goal = createPosition(11, 6);
    state.monsters = [createMonster(3, 6), createMonster(7, 6), createMonster(10, 6)];
    state.bonuses = [createBonus(2, 6, BonusType.CapOfInvisibility), createBonus(5, 6, BonusType.TimeBomb)];
    for (let i = 4; i < 11; i++) {
      if (i !== 5 && i !== 8) {
        state.obstacles.push(createPosition(i, 5));
        state.obstacles.push(createPosition(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  10: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(13, 13, 'Crush, Confuse, Conquer', 'A symphony of chaos!');
    state.playerPosition = createPosition(0, 6);
    state.goal = createPosition(12, 6);
    state.monsters = [createMonster(4, 6), createMonster(8, 6), createMonster(11, 6)];
    state.bonuses = [createBonus(2, 6, BonusType.Crusher), createBonus(6, 6, BonusType.ConfusedMonsters)];
    for (let i = 3; i < 12; i++) {
      if (i !== 6 && i !== 9) {
        state.obstacles.push(createPosition(i, 5));
        state.obstacles.push(createPosition(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  11: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(14, 14, 'The Triple Threat', 'Build, Bomb, and Vanish!');
    state.playerPosition = createPosition(0, 7);
    state.goal = createPosition(13, 7);
    state.monsters = [createMonster(3, 7), createMonster(6, 7), createMonster(9, 7), createMonster(12, 7)];
    state.bonuses = [
      createBonus(2, 7, BonusType.Builder),
      createBonus(5, 7, BonusType.TimeBomb),
      createBonus(8, 7, BonusType.CapOfInvisibility),
    ];
    for (let i = 4; i < 13; i++) {
      if (i !== 5 && i !== 8 && i !== 11) {
        state.obstacles.push(createPosition(i, 6));
        state.obstacles.push(createPosition(i, 8));
      }
    }
    return [state, config, config.levelStory];
  },
  12: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(15, 15, 'The Gauntlet', "Use everything you've learned!");
    state.playerPosition = createPosition(0, 7);
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
      createBonus(5, 7, BonusType.Crusher),
      createBonus(8, 7, BonusType.ConfusedMonsters),
      createBonus(11, 7, BonusType.Builder),
    ];
    for (let i = 4; i < 14; i++) {
      if (i !== 5 && i !== 8 && i !== 11) {
        state.obstacles.push(createPosition(i, 6));
        state.obstacles.push(createPosition(i, 8));
      }
    }
    for (let i = 4; i < 11; i++) {
      if (i !== 7) {
        state.obstacles.push(createPosition(6, i));
        state.obstacles.push(createPosition(8, i));
      }
    }
    return [state, config, config.levelStory];
  },
  13: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(16, 16, 'The Final Countdown', 'Can you outsmart them all?');
    state.playerPosition = createPosition(0, 8);
    state.goal = createPosition(15, 8);
    state.monsters = [
      createMonster(3, 8),
      createMonster(6, 8),
      createMonster(9, 8),
      createMonster(12, 8),
      createMonster(8, 3),
      createMonster(8, 13),
      createMonster(15, 3),
      createMonster(15, 13),
    ];
    state.bonuses = [
      createBonus(2, 8, BonusType.CapOfInvisibility),
      createBonus(5, 8, BonusType.TimeBomb),
      createBonus(8, 8, BonusType.LandMine),
      createBonus(11, 8, BonusType.Crusher),
      createBonus(14, 8, BonusType.ConfusedMonsters),
    ];
    for (let i = 4; i < 15; i++) {
      if (i !== 5 && i !== 8 && i !== 11 && i !== 14) {
        state.obstacles.push(createPosition(i, 7));
        state.obstacles.push(createPosition(i, 9));
      }
    }
    for (let i = 4; i < 13; i++) {
      if (i !== 8) {
        state.obstacles.push(createPosition(7, i));
        state.obstacles.push(createPosition(9, i));
      }
    }
    return [state, config, config.levelStory];
  },
};

export const generateLevel = (level: number): [GameState, LevelConfig, string] => {
  if (level < 1 || level > 13) {
    throw new Error(`Invalid level number: ${level}`);
  }
  return levels[level]();
};
