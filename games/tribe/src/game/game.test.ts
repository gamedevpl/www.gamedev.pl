import { describe, it, expect } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { GAME_DAY_IN_REAL_SECONDS, HUMAN_YEAR_IN_REAL_SECONDS } from './world-consts';

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

    const yearsToSimulate = 100;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // Simulate one hour at a time for precision
    let yearsSimulated = 0;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
      if (gameState.time >= (yearsSimulated + 1) * HUMAN_YEAR_IN_REAL_SECONDS) {
        yearsSimulated++;
        const humanCount = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'human').length;
        const bushCount = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'berryBush').length;
        const avgHumanAge =
          Array.from(gameState.entities.entities.values())
            .filter((e) => e.type === 'human')
            .reduce((sum, e) => sum + (e as HumanEntity).age, 0) / humanCount || 0;
        const childCount = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'human' && (e as HumanEntity).age < 18,
        ).length;
        const maleCount = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'human' && (e as HumanEntity).gender === 'male',
        ).length;
        const maxHumanAge = Math.max(
          ...Array.from(gameState.entities.entities.values())
            .filter((e) => e.type === 'human')
            .map((e) => (e as HumanEntity).age),
        );
        console.log(
          `Year ${yearsSimulated}: Humans: ${humanCount}, Bushes: ${bushCount}, Avg Age: ${avgHumanAge.toFixed(
            2,
          )}, Max Age: ${maxHumanAge.toFixed(2)}, Children: ${childCount}, Gender Ratio (M:F): ${maleCount}:${
            humanCount - maleCount
          }`,
        );
      }
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
