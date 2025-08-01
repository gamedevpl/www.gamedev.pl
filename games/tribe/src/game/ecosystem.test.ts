import { initGame } from './index';
import { GameWorldState } from './world-types';
import { updateWorld } from './world-update';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from './world-consts';
import { describe, it, expect } from 'vitest';
import { IndexedWorldState } from './world-index/world-index-types';
import { trainEcosystemAgent } from './ecosystem/q-learning-trainer';
import { resetEcosystemBalancer } from './ecosystem';

/**
 * Run ecosystem simulation and collect statistics
 */
function simulateEcosystem(gameState: GameWorldState, yearsToSimulate: number, testName: string) {
  const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
  const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
  let yearsSimulated = 0;
  
  const stats = {
    interventions: 0,
    avgPrey: 0,
    avgPredators: 0,
    avgBushes: 0,
    finalPrey: 0,
    finalPredators: 0,
    finalBushes: 0,
    yearlyData: [] as Array<{
      year: number;
      prey: number;
      predators: number;
      bushes: number;
      childPrey: number;
      childPredators: number;
      humans: number;
    }>
  };

  for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
    gameState = updateWorld(gameState, timeStepSeconds);

    const currentYear = Math.floor(gameState.time / (HUMAN_YEAR_IN_REAL_SECONDS * HOURS_PER_GAME_DAY));
    if (currentYear > yearsSimulated) {
      yearsSimulated = currentYear;
      const indexedState = gameState as IndexedWorldState;
      const preyCount = indexedState.search.prey.count();
      const predatorCount = indexedState.search.predator.count();
      const bushCount = indexedState.search.berryBush.count();
      const humanCount = indexedState.search.human.count();
      
      // Count child populations
      const childPreyCount = indexedState.search.prey.byProperty('isAdult', false).length;
      const childPredatorCount = indexedState.search.predator.byProperty('isAdult', false).length;

      const yearData = {
        year: yearsSimulated,
        prey: preyCount,
        predators: predatorCount,
        bushes: bushCount,
        childPrey: childPreyCount,
        childPredators: childPredatorCount,
        humans: humanCount
      };
      
      stats.yearlyData.push(yearData);

      console.log(
        `${testName} Year ${yearsSimulated}: Prey: ${preyCount}(${childPreyCount} children), Predators: ${predatorCount}(${childPredatorCount} children), Bushes: ${bushCount}, Humans: ${humanCount}`,
      );

      // Early exit if ecosystem collapses
      if (preyCount === 0 && predatorCount === 0) {
        console.log(`Ecosystem collapsed at year ${yearsSimulated}`);
        break;
      }
    }
  }

  // Calculate final statistics
  stats.finalPrey = (gameState as IndexedWorldState).search.prey.count();
  stats.finalPredators = (gameState as IndexedWorldState).search.predator.count();
  stats.finalBushes = (gameState as IndexedWorldState).search.berryBush.count();
  
  if (stats.yearlyData.length > 0) {
    stats.avgPrey = stats.yearlyData.reduce((sum, d) => sum + d.prey, 0) / stats.yearlyData.length;
    stats.avgPredators = stats.yearlyData.reduce((sum, d) => sum + d.predators, 0) / stats.yearlyData.length;
    stats.avgBushes = stats.yearlyData.reduce((sum, d) => sum + d.bushes, 0) / stats.yearlyData.length;
  }

  return stats;
}

describe('Enhanced Ecosystem Balance', () => {
  it('should maintain stable ecosystem without human interference', () => {
    // Quick training before the test
    resetEcosystemBalancer();
    console.log('Training Q-learning agent for pure ecosystem test...');
    const trainingResults = trainEcosystemAgent(15, 10); // More training for pure ecosystem
    console.log(`Training results: ${trainingResults.successfulEpisodes}/${trainingResults.episodesCompleted} successful episodes`);

    let gameState: GameWorldState = initGame();

    // Remove all humans to test pure ecosystem balance
    const humanIds = Array.from(gameState.entities.entities.values())
      .filter((e) => e.type === 'human')
      .map((e) => e.id);

    for (const id of humanIds) {
      gameState.entities.entities.delete(id);
    }

    const stats = simulateEcosystem(gameState, 50, 'Pure Ecosystem');

    // Assert that populations are within a healthy range of the target
    const preyLowerBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.25; // 25
    const preyUpperBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 1.5;  // 150
    const predatorLowerBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.25; // 5
    const predatorUpperBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 1.5;  // 30
    const bushLowerBound = ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 0.25; // 15
    const bushUpperBound = ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 1.5;  // 90

    expect(stats.finalPrey).toBeGreaterThan(preyLowerBound);
    expect(stats.finalPrey).toBeLessThan(preyUpperBound);
    expect(stats.finalPredators).toBeGreaterThan(predatorLowerBound);
    expect(stats.finalPredators).toBeLessThan(predatorUpperBound);
    expect(stats.finalBushes).toBeGreaterThan(bushLowerBound);
    expect(stats.finalBushes).toBeLessThan(bushUpperBound);

    console.log(
      `Pure Ecosystem Final - Prey: ${stats.finalPrey} (Avg: ${stats.avgPrey.toFixed(1)}), Predators: ${stats.finalPredators} (Avg: ${stats.avgPredators.toFixed(1)}), Bushes: ${stats.finalBushes} (Avg: ${stats.avgBushes.toFixed(1)})`,
    );
    
    // Check that child populations exist (indicating reproduction)
    const hasChildPopulations = stats.yearlyData.some(d => d.childPrey > 0 || d.childPredators > 0);
    expect(hasChildPopulations).toBe(true);
  }, 240000); // 4 minute timeout

  it('should maintain stable ecosystem with human population', () => {
    // Train agent for ecosystem with humans
    resetEcosystemBalancer();
    console.log('Training Q-learning agent for human-ecosystem interaction...');
    const trainingResults = trainEcosystemAgent(12, 8); // Training for human interaction
    console.log(`Training results: ${trainingResults.successfulEpisodes}/${trainingResults.episodesCompleted} successful episodes`);

    let gameState: GameWorldState = initGame();
    // Keep humans in this test

    const stats = simulateEcosystem(gameState, 40, 'Human-Ecosystem');

    // With humans, expect slightly different balance due to gathering pressure
    const preyLowerBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.3; // 30 - higher minimum due to human hunting
    const preyUpperBound = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 1.4;  // 140
    const predatorLowerBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.2; // 4 - may be lower due to human competition
    const predatorUpperBound = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 1.3;  // 26
    const bushLowerBound = ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 0.2; // 12 - lower due to human gathering
    const bushUpperBound = ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 1.2;  // 72

    expect(stats.finalPrey).toBeGreaterThan(preyLowerBound);
    expect(stats.finalPrey).toBeLessThan(preyUpperBound);
    expect(stats.finalPredators).toBeGreaterThan(predatorLowerBound);
    expect(stats.finalPredators).toBeLessThan(predatorUpperBound);
    expect(stats.finalBushes).toBeGreaterThan(bushLowerBound);
    expect(stats.finalBushes).toBeLessThan(bushUpperBound);

    console.log(
      `Human-Ecosystem Final - Prey: ${stats.finalPrey} (Avg: ${stats.avgPrey.toFixed(1)}), Predators: ${stats.finalPredators} (Avg: ${stats.avgPredators.toFixed(1)}), Bushes: ${stats.finalBushes} (Avg: ${stats.avgBushes.toFixed(1)})`,
    );

    // Verify human population exists and is stable
    const avgHumans = stats.yearlyData.reduce((sum, d) => sum + d.humans, 0) / stats.yearlyData.length;
    expect(avgHumans).toBeGreaterThan(0);
    console.log(`Average human population: ${avgHumans.toFixed(1)}`);
    
    // Check for reproductive health in wildlife despite human presence
    const avgChildPrey = stats.yearlyData.reduce((sum, d) => sum + d.childPrey, 0) / stats.yearlyData.length;
    const avgChildPredators = stats.yearlyData.reduce((sum, d) => sum + d.childPredators, 0) / stats.yearlyData.length;
    expect(avgChildPrey + avgChildPredators).toBeGreaterThan(0);
    console.log(`Average child wildlife: Prey ${avgChildPrey.toFixed(1)}, Predators ${avgChildPredators.toFixed(1)}`);
  }, 240000); // 4 minute timeout
});
