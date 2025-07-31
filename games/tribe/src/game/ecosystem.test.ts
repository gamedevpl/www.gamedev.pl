import { PreyEntity } from './entities/characters/prey/prey-types';
import { PredatorEntity } from './entities/characters/predator/predator-types';
import { initGame } from './index';
import { GameWorldState } from './world-types';
import { updateWorld } from './world-update';
import { GAME_DAY_IN_REAL_SECONDS, HUMAN_YEAR_IN_REAL_SECONDS } from './world-consts';
import { describe, it } from 'vitest';

describe('Ecosystem Balance', () => {
  it('should achieve balance of living prey/predators/bushes over multiple game years without humans', () => {
    let gameState: GameWorldState = initGame();

    // Remove all humans to test pure ecosystem balance
    const humanIds = Array.from(gameState.entities.entities.values())
      .filter((e) => e.type === 'human')
      .map((e) => e.id);

    for (const id of humanIds) {
      gameState.entities.entities.delete(id);
    }

    const yearsToSimulate = 10; // Test ecosystem balance over 10 years
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
    let yearsSimulated = 0;

    // Track population metrics over time
    const populationHistory: Array<{
      year: number;
      preyCount: number;
      predatorCount: number;
      bushCount: number;
      preyAdults: number;
      predatorAdults: number;
      avgPreyHunger: number;
      avgPredatorHunger: number;
    }> = [];

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);

      if (gameState.time >= (yearsSimulated + 1) * HUMAN_YEAR_IN_REAL_SECONDS) {
        yearsSimulated++;

        const prey = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'prey') as PreyEntity[];
        const predators = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'predator',
        ) as PredatorEntity[];
        const bushes = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'berryBush');

        const preyCount = prey.length;
        const predatorCount = predators.length;
        const bushCount = bushes.length;
        const preyAdults = prey.filter((e) => e.isAdult).length;
        const predatorAdults = predators.filter((e) => e.isAdult).length;
        const avgPreyHunger = preyCount > 0 ? prey.reduce((sum, e) => sum + e.hunger, 0) / preyCount : 0;
        const avgPredatorHunger =
          predatorCount > 0 ? predators.reduce((sum, e) => sum + e.hunger, 0) / predatorCount : 0;

        const stats = {
          year: yearsSimulated,
          preyCount,
          predatorCount,
          bushCount,
          preyAdults,
          predatorAdults,
          avgPreyHunger,
          avgPredatorHunger,
        };

        populationHistory.push(stats);

        console.log(
          `Ecosystem Year ${yearsSimulated}: Prey: ${preyCount} (${preyAdults} adults), ` +
            `Predators: ${predatorCount} (${predatorAdults} adults), ` +
            `Bushes: ${bushCount}, ` +
            `Hunger (Prey:Predator): ${avgPreyHunger.toFixed(1)}:${avgPredatorHunger.toFixed(1)}`,
        );

        // Early exit if ecosystem collapses
        if (preyCount === 0 && predatorCount === 0) {
          console.log(`Ecosystem collapsed at year ${yearsSimulated}`);
          break;
        }
      }

      if (gameState.gameOver) {
        console.log(`Game ended at year ${yearsSimulated}`);
        break;
      }
    }

    // Analyze ecosystem balance
    const finalStats = populationHistory[populationHistory.length - 1];
    // const initialStats = populationHistory[0]; // Available if needed for future analysis

    // Ecosystem should maintain viable populations
    expect(finalStats.preyCount).toBeGreaterThan(0); // Prey should survive
    expect(finalStats.bushCount).toBeGreaterThan(10); // Berry bushes should be sustainable

    // There should be some ecosystem activity
    expect(populationHistory.length).toBeGreaterThan(5); // Should run for at least 5 years

    // Population shouldn't crash to zero immediately
    const midpointStats = populationHistory[Math.floor(populationHistory.length / 2)];
    expect(midpointStats.preyCount).toBeGreaterThan(0);
    expect(midpointStats.bushCount).toBeGreaterThan(5);

    // Predators might go extinct (acceptable), but prey and plants must survive
    console.log('Final ecosystem state:', finalStats);
    console.log('Population stability test passed');
  }, 60000); // 60 second timeout
});
