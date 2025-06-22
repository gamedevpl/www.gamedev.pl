import { describe, it, expect } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { GAME_DAY_IN_REAL_SECONDS, HUMAN_YEAR_IN_REAL_SECONDS, KARMA_ENEMY_THRESHOLD } from './world-consts';
import { isLineage } from './utils/world-utils';

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

    const yearsToSimulate = 200;
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

        let enemyPairs = 0;
        const countedPairs = new Set<string>();
        for (const human of humans) {
          for (const targetIdStr in human.karma) {
            const targetId = parseInt(targetIdStr, 10);
            const pairKey1 = `${human.id}-${targetId}`;
            const pairKey2 = `${targetId}-${human.id}`;

            if (
              (human.karma[targetId] || 0) < KARMA_ENEMY_THRESHOLD &&
              !countedPairs.has(pairKey1) &&
              !countedPairs.has(pairKey2)
            ) {
              enemyPairs++;
              countedPairs.add(pairKey1);
            }
          }
        }
        const maxAncestors = Math.max(...humans.map((h) => (h.ancestorIds ? h.ancestorIds.length : 0)), 0);

        console.log(
          `Year ${yearsSimulated}: Humans: ${humanCount}, Lineages: ${
            lineages.length
          }, Bushes: ${bushCount}, Age(Avg:Max): ${avgHumanAge.toFixed(2)}:${maxHumanAge.toFixed(
            2,
          )}, Children: ${childCount}, Corpses: ${corpsesCount}, Gender Ratio (M:F): ${maleCount}:${
            humanCount - maleCount
          }, Avg Hunger: ${averageHunger.toFixed(
            2,
          )}, Food (Berries:Meat): ${foodBerries}:${foodMeat}, Enemies: ${enemyPairs}, Max Ancestors: ${maxAncestors}`,
        );

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
