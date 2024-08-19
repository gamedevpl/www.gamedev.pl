import { GameState, LevelConfig, Position, Monster, Player, BonusType, Obstacle } from './gameplay-types';

const createPosition = (x: number, y: number): Position => ({ x, y });

const createBonus = (x: number, y: number, type: BonusType) => ({
  position: createPosition(x, y),
  type,
});

const createMonster = (x: number, y: number): Monster => ({
  position: createPosition(x, y),
  previousPosition: createPosition(x, y),
  moveTimestamp: Date.now(),
  path: [],
  seed: Math.random(),
  isConfused: false,
});

const createPlayer = (x: number, y: number): Player => ({
  position: createPosition(x, y),
  previousPosition: createPosition(x, y),
  moveTimestamp: Date.now(),
  isInvisible: false,
  isVictorious: false,
  isVanishing: false,
});

const createObstacle = (x: number, y: number): Obstacle => ({
  position: createPosition(x, y),
  creationTime: Date.now(),
  isRaising: false,
  isDestroying: false,
});

const generateBaseState = (): GameState => ({
  player: createPlayer(0, 0),
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
  gameEndingState: 'none',
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
    state.player = createPlayer(0, 3);
    state.goal = createPosition(6, 3);
    state.monsters = [createMonster(3, 0)];
    state.obstacles = [createObstacle(5, 2), createObstacle(5, 3)];
    return [state, config, config.levelStory];
  },
  2: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(8, 8, 'Now You See Me', 'Use the invisibility cap to sneak past the monsters!');
    state.player = createPlayer(0, 4);
    state.goal = createPosition(7, 4);
    state.monsters = [createMonster(3, 2), createMonster(5, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.CapOfInvisibility)];
    state.obstacles = [createObstacle(1, 3), createObstacle(1, 5), createObstacle(6, 3), createObstacle(6, 5)];
    return [state, config, config.levelStory];
  },
  3: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(9, 9, 'Bridge the Gap', 'Build your way to victory!');
    state.player = createPlayer(0, 4);
    state.goal = createPosition(8, 4);
    state.monsters = [createMonster(4, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.Builder)];
    state.obstacles = [
      createObstacle(3, 3),
      createObstacle(3, 4),
      createObstacle(3, 5),
      createObstacle(5, 3),
      createObstacle(5, 4),
      createObstacle(5, 5),
    ];
    return [state, config, config.levelStory];
  },
  4: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(9, 9, 'Crush and Rush', 'Clear the path with your crushing power!');
    state.player = createPlayer(0, 4);
    state.goal = createPosition(8, 4);
    state.monsters = [createMonster(4, 4)];
    state.bonuses = [createBonus(2, 4, BonusType.Crusher)];
    state.obstacles = [
      createObstacle(8, 2),
      createObstacle(7, 2),
      createObstacle(7, 3),
      createObstacle(7, 4),
      createObstacle(7, 5),
      createObstacle(8, 5),
    ];
    for (let i = 2; i < 7; i++) {
      state.obstacles.push(createObstacle(i, 3));
      state.obstacles.push(createObstacle(i - 1, 5));
    }
    return [state, config, config.levelStory];
  },
  5: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(10, 10, 'Tick Tock Boom', 'Time your bomb perfectly to clear the way!');
    state.player = createPlayer(0, 5);
    state.goal = createPosition(9, 5);
    state.monsters = [createMonster(3, 5)];
    state.bonuses = [createBonus(9, 3, BonusType.TimeBomb)];
    state.obstacles = [
      // tunnel
      createObstacle(9, 4),
      createObstacle(8, 4),
      createObstacle(8, 5),
      createObstacle(8, 6),
      createObstacle(9, 6),
      // run around this and time the bomb
      createObstacle(4, 1),
      createObstacle(5, 1),
      createObstacle(6, 1),
      createObstacle(7, 1),
      createObstacle(8, 1),
    ];
    for (let i = 2; i < 8; i++) {
      state.obstacles.push(createObstacle(i, 4));
      state.obstacles.push(createObstacle(i, 6));
      state.obstacles.push(createObstacle(i - 2, 8));
    }
    return [state, config, config.levelStory];
  },
  6: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(10, 10, "Minesweeper's Revenge", 'Plant a surprise for your pursuers!');
    state.player = createPlayer(0, 5);
    state.goal = createPosition(9, 5);
    state.monsters = [createMonster(6, 5), createMonster(4, 8), createMonster(8, 8)];
    state.bonuses = [createBonus(2, 5, BonusType.LandMine)];
    for (let i = 4; i < 9; i++) {
      if (i !== 6) {
        state.obstacles.push(createObstacle(i, 4));
        state.obstacles.push(createObstacle(i, 6));
      }
    }
    return [state, config, config.levelStory];
  },
  7: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(11, 11, "Monsters' Mayhem", 'Confuse them all and make your escape!');
    state.player = createPlayer(0, 5);
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
      state.obstacles.push(createObstacle(i, 3));
      state.obstacles.push(createObstacle(i, 7));
    }
    return [state, config, config.levelStory];
  },
  8: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(12, 12, 'Tunnel Vision', 'Build a path and set a trap!');
    state.player = createPlayer(0, 6);
    state.goal = createPosition(11, 6);
    state.monsters = [createMonster(3, 10), createMonster(8, 8)];
    state.bonuses = [createBonus(2, 6, BonusType.Builder), createBonus(2, 2, BonusType.LandMine)];
    for (let i = 3; i < 10; i++) {
      if (i !== 6) {
        state.obstacles.push(createObstacle(i, 5));
        state.obstacles.push(createObstacle(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  9: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(12, 12, 'Ghost Bomber', 'Vanish, plant, and detonate!');
    state.player = createPlayer(0, 6);
    state.goal = createPosition(11, 6);
    state.monsters = [createMonster(3, 6), createMonster(7, 6), createMonster(10, 6)];
    state.bonuses = [createBonus(2, 6, BonusType.CapOfInvisibility), createBonus(5, 6, BonusType.TimeBomb)];
    for (let i = 4; i < 11; i++) {
      if (i !== 5 && i !== 8) {
        state.obstacles.push(createObstacle(i, 5));
        state.obstacles.push(createObstacle(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  10: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(13, 13, 'Crush, Confuse, Conquer', 'A symphony of chaos!');
    state.player = createPlayer(0, 6);
    state.goal = createPosition(12, 6);
    state.monsters = [createMonster(4, 6), createMonster(8, 6), createMonster(11, 6)];
    state.bonuses = [createBonus(2, 6, BonusType.Crusher), createBonus(6, 6, BonusType.ConfusedMonsters)];
    for (let i = 3; i < 12; i++) {
      if (i !== 6 && i !== 9) {
        state.obstacles.push(createObstacle(i, 5));
        state.obstacles.push(createObstacle(i, 7));
      }
    }
    return [state, config, config.levelStory];
  },
  11: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(14, 14, 'The Triple Threat', 'Build, Bomb, and Vanish!');
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
  },
  12: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(15, 15, 'The Gauntlet', "Use everything you've learned!");
    state.player = createPlayer(0, 7);
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
      createBonus(2, 8, BonusType.CapOfInvisibility),
      createBonus(5, 7, BonusType.Crusher),
      createBonus(8, 7, BonusType.ConfusedMonsters),
      createBonus(1, 6, BonusType.Builder),
      createBonus(2, 6, BonusType.TimeBomb),
    ];
    for (let i = 4; i < 14; i++) {
      if (i !== 5 && i !== 8 && i !== 11) {
        state.obstacles.push(createObstacle(i, 6));
        state.obstacles.push(createObstacle(i, 8));
      }
    }
    for (let i = 4; i < 11; i++) {
      if (i !== 7) {
        state.obstacles.push(createObstacle(6, i));
        state.obstacles.push(createObstacle(8, i));
      }
    }
    return [state, config, config.levelStory];
  },
  13: () => {
    const state = generateBaseState();
    const config = generateBaseConfig(16, 16, 'The Final Countdown', 'Can you outsmart them all?');
    state.player = createPlayer(0, 8);
    state.goal = createPosition(15, 8);
    state.monsters = [
      createMonster(5, 8),
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
      createBonus(11, 1, BonusType.Crusher),
      createBonus(14, 14, BonusType.ConfusedMonsters),
    ];
    for (let i = 4; i < 15; i++) {
      if (i !== 5 && i !== 8 && i !== 11 && i !== 14) {
        state.obstacles.push(createObstacle(i, 7));
        state.obstacles.push(createObstacle(i, 9));
      }
    }
    for (let i = 4; i < 13; i++) {
      if (i !== 8) {
        state.obstacles.push(createObstacle(7, i));
        state.obstacles.push(createObstacle(9, i));
      }
    }
    state.obstacles.push(createObstacle(14, 8));
    return [state, config, config.levelStory];
  },
};

export const generateLevel = (level: number): [GameState, LevelConfig, string] => {
  if (level < 1 || level > 13) {
    throw new Error(`Invalid level number: ${level}`);
  }
  return levels[level]();
};
