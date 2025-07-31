import { describe, it, expect, vi } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import {
  BERRY_COST_FOR_PLANTING,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_PLANTING_DURATION_HOURS,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from './world-consts';
import { isLineage } from './utils/world-utils';
import { createHuman, giveBirth } from './entities/entities-update';
import { humanProcreationInteraction } from './interactions/human-procreation-interaction';
import { FoodType } from './food/food-types';
import { btProfiler } from './ai/behavior-tree/bt-profiler';

// Helper to find a human by ID, with proper type assertion
const findHumanById = (gameState: GameWorldState, id: number): HumanEntity | undefined => {
  return gameState.entities.entities.get(id) as HumanEntity | undefined;
};

describe('Game Mechanics', () => {
  it('should be able to run for 100 years without a player and still have alive humans', () => {
    let gameState: GameWorldState = initGame();

    // Find the player and disable player control
    const playerEntity = Array.from(gameState.entities.entities.values()).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }

    const yearsToSimulate = parseInt(process.env.YEARS_TO_SIMULATE || '100', 10);
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // Simulate one hour at a time for precision
    let yearsSimulated = 0;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
      if (gameState.time >= (yearsSimulated + 1) * HUMAN_YEAR_IN_REAL_SECONDS) {
        yearsSimulated++;
        const humans = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'human',
        ) as HumanEntity[];
        const humanCount = humans.length;
        const bushCount = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'berryBush').length;
        const avgHumanAge = humans.reduce((sum, e) => sum + e.age, 0) / humanCount || 0;
        const childCount = humans.filter((e) => e.age < 18).length;
        const maleCount = humans.filter((e) => e.gender === 'male').length;
        const maxHumanAge = Math.max(...humans.map((e) => e.age));
        const averageHunger = humans.reduce((sum, e) => sum + e.hunger, 0) / humanCount || 0;
        const corpsesCount = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'humanCorpse',
        ).length;
        const foodBerries = humans
          .filter((e) => e.food.length > 0)
          .reduce((sum, e) => sum + e.food.filter((f) => f.type === 'berry').length, 0);
        const foodMeat = humans
          .filter((e) => e.food.length > 0)
          .reduce((sum, e) => sum + (e as HumanEntity).food.filter((f) => f.type === 'meat').length, 0);
        // need to count lineages, so
        const lineages: HumanEntity[][] = [];
        for (const human of humans) {
          const lineage = lineages.find((lineage) => lineage.some((h) => isLineage(h, human)));
          if (lineage) {
            lineage.push(human);
          } else {
            lineages.push([human]);
          }
        }
        const leaderCount = [...new Set(humans.map((h) => h.leaderId).filter((id) => id !== undefined))].length;

        const maxAncestors = Math.max(...humans.map((h) => (h.ancestorIds ? h.ancestorIds.length : 0)), 0);

        console.log(
          `Year ${yearsSimulated}: Humans: ${humanCount}, Lineages: ${
            lineages.length
          }, Tribes: ${leaderCount}, Bushes: ${bushCount}, Age(Avg:Max): ${avgHumanAge.toFixed(
            2,
          )}:${maxHumanAge.toFixed(
            2,
          )}, Children: ${childCount}, Corpses: ${corpsesCount}, Gender Ratio (M:F): ${maleCount}:${
            humanCount - maleCount
          }, Avg Hunger: ${averageHunger.toFixed(
            2,
          )}, Food (Berries:Meat): ${foodBerries}:${foodMeat}, Max Ancestors: ${maxAncestors}`,
        );

        if (yearsSimulated % 50 === 0) {
          btProfiler.report();
          btProfiler.reset();
        }

        if (humanCount <= 0) {
          console.log(`Game ended prematurely at time ${time} due to extinction of humans.`);
          gameState.gameOver = true;
          gameState.causeOfGameOver = 'Extinction of humans';
          break; // Stop if humans go extinct
        }
      }
      // Check if the game has ended prematurely
      if (gameState.gameOver) {
        console.log(`Game ended prematurely at time ${time} due to: ${gameState.causeOfGameOver}`);
        break; // Stop if the game ends prematurely
      }
    }

    const bushCount = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'berryBush').length;
    const humanCount = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'human').length;

    expect(bushCount).toBeGreaterThan(0);
    expect(humanCount).toBeGreaterThan(0);
  }, 60000);
});

describe('Tribe Formation via Splitting', () => {
  it('should form a new tribe when an unrelated male partners for the first time', () => {
    let gameState = initGame();

    // 1. Create a leader for the initial tribe
    const leaderA = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
    leaderA.leaderId = leaderA.id;
    leaderA.tribeBadge = '👑';

    // 2. Create a male who is part of the leader's tribe but not related
    const maleB = createHuman(
      gameState.entities,
      { x: 150, y: 150 },
      0,
      'male',
      false,
      25,
      0,
      undefined,
      undefined,
      [],
      leaderA.id,
      leaderA.tribeBadge,
    );

    // 3. Create a female who is also not related to the leader
    const femaleC = createHuman(gameState.entities, { x: 200, y: 200 }, 0, 'female', false, 22);

    // Pre-conditions check
    expect(isLineage(maleB, leaderA)).toBe(false);
    expect(isLineage(femaleC, leaderA)).toBe(false);
    expect(maleB.leaderId).toBe(leaderA.id);
    expect(femaleC.leaderId).toBeUndefined();

    // 4. Trigger procreation
    maleB.activeAction = 'procreating';
    femaleC.activeAction = 'procreating';
    humanProcreationInteraction.perform(maleB, femaleC, { gameState, deltaTime: 1 });

    // 5. Assertions
    const updatedMaleB = findHumanById(gameState, maleB.id);
    const updatedFemaleC = findHumanById(gameState, femaleC.id);

    expect(updatedMaleB?.leaderId).toBe(maleB.id); // Male B is the new leader
    expect(updatedMaleB?.tribeBadge).not.toBe(leaderA.tribeBadge); // Has a new badge
    expect(updatedFemaleC?.leaderId).toBe(maleB.id); // Female C joined the new tribe
    expect(updatedFemaleC?.tribeBadge).toBe(updatedMaleB?.tribeBadge); // Shares the new badge
  });

  it('should not form a new tribe if the male is related to the leader', () => {
    let gameState = initGame();
    const updateContext = { gameState, deltaTime: 1 };

    // 1. Create a leader for the initial tribe
    const leaderA = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 40);
    leaderA.leaderId = leaderA.id;
    leaderA.tribeBadge = '👑';

    // 2. Create a female partner for the leader to have a child
    const femalePartner = createHuman(gameState.entities, { x: 110, y: 110 }, 0, 'female', false, 38);

    // 3. Give them a son (Male B)
    const maleB = giveBirth(femalePartner, leaderA.id, updateContext);
    if (!maleB) throw new Error('Birth failed');

    maleB.age = 25; // Make him an adult
    maleB.isAdult = true;

    // 4. Create another unrelated female
    const femaleC = createHuman(gameState.entities, { x: 200, y: 200 }, 0, 'female', false, 22);

    // Pre-conditions check
    const updatedLeaderA = findHumanById(gameState, leaderA.id)!;
    const updatedMaleB = findHumanById(gameState, maleB.id)!;
    expect(isLineage(updatedMaleB, updatedLeaderA)).toBe(true); // Male B is related to Leader A
    expect(updatedMaleB.leaderId).toBe(leaderA.id);

    // 5. Trigger procreation
    updatedMaleB.activeAction = 'procreating';
    femaleC.activeAction = 'procreating';
    humanProcreationInteraction.perform(updatedMaleB, femaleC, updateContext);

    // 6. Assertions
    const finalMaleB = findHumanById(gameState, maleB.id);
    const finalFemaleC = findHumanById(gameState, femaleC.id);

    expect(finalMaleB?.leaderId).toBe(leaderA.id); // Male B is still in the same tribe
    expect(finalMaleB?.tribeBadge).toBe(leaderA.tribeBadge);
    expect(finalFemaleC?.leaderId).toBeUndefined(); // Female C does not join the tribe automatically in this case
  });
});

describe('Planting bushes', () => {
  it('a human with 5 berries can plant a bush', () => {
    let gameState = initGame();
    const human = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'female', true, 25);
    human.food = Array.from({ length: 10 }, () => ({ type: FoodType.Berry, id: Math.random() }));

    const initialBushCount = Array.from(gameState.entities.entities.values()).filter(
      (e) => e.type === 'berryBush',
    ).length;

    human.activeAction = 'planting';
    human.target = { x: 150, y: 150 };

    // a bit more than the planting duration
    const timeStep = HUMAN_PLANTING_DURATION_HOURS + 0.1;
    gameState = updateWorld(gameState, timeStep);

    const finalBushCount = Array.from(gameState.entities.entities.values()).filter(
      (e) => e.type === 'berryBush',
    ).length;

    const updatedHuman = findHumanById(gameState, human.id);

    expect(finalBushCount).toBeGreaterThan(initialBushCount);
    expect(updatedHuman?.food.length).toBeLessThan(10);
  });
});

describe('BT Profiler', () => {
  it('should show problem report by default', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let gameState: GameWorldState = initGame();
    // Run for a short time to gather some data
    const simulationSeconds = 1;
    const timeStepSeconds = 1 / 60;

    for (let time = 0; time < simulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
      if (gameState.gameOver) break;
    }

    btProfiler.report();

    expect(consoleSpy).toHaveBeenCalledWith('--- Behavior Tree Full Report (Root Not Found) ---');

    // Reset for other tests
    btProfiler.reset();
    consoleSpy.mockRestore();
  });

  it('should show full report when requested', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let gameState: GameWorldState = initGame();
    // Run for a short time to gather some data
    const simulationSeconds = 1;
    const timeStepSeconds = 1 / 60;

    for (let time = 0; time < simulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
      if (gameState.gameOver) break;
    }

    btProfiler.report({ showAll: true });

    expect(consoleSpy).toHaveBeenCalledWith('--- Behavior Tree Full Report ---');

    // Reset for other tests
    btProfiler.reset();
    consoleSpy.mockRestore();
  });
});
