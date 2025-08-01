/**
 * Q-learning training utility for ecosystem balancer.
 * Runs multiple simulations to train the agent before the main test.
 */

import { initGame } from '../index';
import { GameWorldState } from '../world-types';
import { updateWorld } from '../world-update';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from '../world-consts';
import { IndexedWorldState } from '../world-index/world-index-types';
import { resetEcosystemBalancer } from '../ecosystem';

export interface TrainingResults {
  episodesCompleted: number;
  bestFinalScore: number;
  averageFinalScore: number;
  successfulEpisodes: number; // Episodes that didn't collapse
}

/**
 * Train the Q-learning agent by running multiple ecosystem simulations
 */
export function trainEcosystemAgent(episodes: number = 50, yearsPerEpisode: number = 20): TrainingResults {
  let totalScore = 0;
  let bestScore = -Infinity;
  let successfulEpisodes = 0;

  console.log(`Starting Q-learning training: ${episodes} episodes, ${yearsPerEpisode} years each`);

  for (let episode = 0; episode < episodes; episode++) {
    let gameState: GameWorldState = initGame();

    // Remove all humans to test pure ecosystem balance
    const humanIds = Array.from(gameState.entities.entities.values())
      .filter((e) => e.type === 'human')
      .map((e) => e.id);

    for (const id of humanIds) {
      gameState.entities.entities.delete(id);
    }

    const totalSimulationSeconds = yearsPerEpisode * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
    let finalScore = -1000; // Default failure score
    let collapsed = false;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);

      const preyCount = (gameState as IndexedWorldState).search.prey.count();
      const predatorCount = (gameState as IndexedWorldState).search.predator.count();

      // Check for ecosystem collapse
      if (preyCount === 0 && predatorCount === 0) {
        collapsed = true;
        break;
      }
    }

    if (!collapsed) {
      const finalPreyCount = (gameState as IndexedWorldState).search.prey.count();
      const finalPredatorCount = (gameState as IndexedWorldState).search.predator.count();
      const finalBushCount = (gameState as IndexedWorldState).search.berryBush.count();

      // Calculate final score based on how close we are to targets
      const preyScore = Math.max(0, 100 - Math.abs(finalPreyCount - ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION));
      const predatorScore = Math.max(0, 100 - Math.abs(finalPredatorCount - ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION));
      const bushScore = Math.max(0, 100 - Math.abs(finalBushCount - ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT));
      
      finalScore = (preyScore + predatorScore + bushScore) / 3;
      successfulEpisodes++;
    }

    totalScore += finalScore;
    bestScore = Math.max(bestScore, finalScore);

    if ((episode + 1) % 10 === 0) {
      console.log(`Episode ${episode + 1}/${episodes}: Score = ${finalScore.toFixed(1)}, Best = ${bestScore.toFixed(1)}, Success Rate = ${((successfulEpisodes / (episode + 1)) * 100).toFixed(1)}%`);
    }
  }

  const results: TrainingResults = {
    episodesCompleted: episodes,
    bestFinalScore: bestScore,
    averageFinalScore: totalScore / episodes,
    successfulEpisodes,
  };

  console.log(`Training completed: Average Score = ${results.averageFinalScore.toFixed(1)}, Success Rate = ${((successfulEpisodes / episodes) * 100).toFixed(1)}%`);

  return results;
}

/**
 * Quick training session before running tests
 */
export function quickTraining(): void {
  resetEcosystemBalancer();
  trainEcosystemAgent(20, 15); // 20 episodes, 15 years each
}