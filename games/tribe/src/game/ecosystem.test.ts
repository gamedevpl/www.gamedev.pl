import { initGame } from './index';
import { GameWorldState } from './world-types';
import { updateWorld } from './world-update';
import {
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from './world-consts';
import { describe, it, expect } from 'vitest';
import { IndexedWorldState } from './world-index/world-index-types';

describe('Ecosystem Balance', () => {
  it('should maintain a stable balance of prey and predators over a long simulation', () => {
    let gameState: GameWorldState = initGame();

    // Remove all humans to test pure ecosystem balance
    const humanIds = Array.from(gameState.entities.entities.values())
      .filter((e) => e.type === 'human')
      .map((e) => e.id);

    for (const id of humanIds) {
      gameState.entities.entities.delete(id);
    }

    const yearsToSimulate = 100;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
    let yearsSimulated = 0;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);

      if (gameState.time >= (yearsSimulated + 1) * HUMAN_YEAR_IN_REAL_SECONDS) {
        yearsSimulated++;
        const preyCount = (gameState as IndexedWorldState).search.prey.count();
        const predatorCount = (gameState as IndexedWorldState).search.predator.count();

        console.log(
          `Ecosystem Year ${yearsSimulated}: Prey: ${preyCount}, Predators: ${predatorCount}, Prey Gestation: ${gameState.ecosystem.preyGestationPeriod.toFixed(
            2,
          )}, Predator Gestation: ${gameState.ecosystem.predatorGestationPeriod.toFixed(2)}`,
        );

        // Early exit if ecosystem collapses
        if (preyCount === 0 && predatorCount === 0) {
          console.log(`Ecosystem collapsed at year ${yearsSimulated}`);
          break;
        }
      }
    }

    const finalPreyCount = (gameState as IndexedWorldState).search.prey.count();
    const finalPredatorCount = (gameState as IndexedWorldState).search.predator.count;

    // Assert that populations are within a healthy range of the target
    const preyLowerBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.5;
    const preyUpperBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 1.5;
    const predatorLowerBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.5;
    const predatorUpperBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 1.5;

    expect(finalPreyCount).toBeGreaterThan(preyLowerBound);
    expect(finalPreyCount).toBeLessThan(preyUpperBound);
    expect(finalPredatorCount).toBeGreaterThan(predatorLowerBound);
    expect(finalPredatorCount).toBeLessThan(predatorUpperBound);

    console.log(
      `Final Populations - Prey: ${finalPreyCount} (Target: ${ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION}), Predators: ${finalPredatorCount} (Target: ${ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION})`,
    );
  }, 120000); // 120 second timeout for the long simulation
});
