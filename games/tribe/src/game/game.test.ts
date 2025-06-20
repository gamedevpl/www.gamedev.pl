import { describe, it, expect } from 'vitest';
import { initGame } from './index';
import { updateWorld } from './world-update';
import { GameWorldState } from './world-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { GAME_DAY_IN_REAL_SECONDS, HUMAN_YEAR_IN_REAL_SECONDS, KARMA_ENEMY_THRESHOLD } from './world-consts';

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
        const averageHunger =
          Array.from(gameState.entities.entities.values())
            .filter((e) => e.type === 'human')
            .reduce((sum, e) => sum + (e as HumanEntity).hunger, 0) / humanCount || 0;
        const corpsesCount = Array.from(gameState.entities.entities.values()).filter(
          (e) => e.type === 'humanCorpse',
        ).length;
        const foodBerries = Array.from(gameState.entities.entities.values())
          .filter((e) => e.type === 'human' && (e as HumanEntity).food.length > 0)
          .reduce((sum, e) => sum + (e as HumanEntity).food.filter((f) => f.type === 'berry').length, 0);
        const foodMeat = Array.from(gameState.entities.entities.values())
          .filter((e) => e.type === 'human' && (e as HumanEntity).food.length > 0)
          .reduce((sum, e) => sum + (e as HumanEntity).food.filter((f) => f.type === 'meat').length, 0);
        // need to count lineages, so
        const lineages: { [key: string]: number } = {};
        for (const entity of gameState.entities.entities.values()) {
          if (entity.type === 'human') {
            const human = entity as HumanEntity;
            const getParent = (human: HumanEntity): HumanEntity | undefined =>
              [human.fatherId, human.motherId]
                .map((id) => {
                  return id ? (gameState.entities.entities.get(id) as HumanEntity) : undefined;
                })
                .filter((p) => p?.type === 'human')[0];
            let parent = getParent(human);
            if (parent) {
              const visited = new Set<number>();
              while (getParent(parent!) && !visited.has(getParent(parent!)?.id ?? 0)) {
                parent = getParent(parent!);
                visited.add(parent!.id);
              }
              lineages[parent!.id] = (lineages[parent!.id] || 0) + 1;
            } else {
              lineages[human.id] = 1;
            }
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

        console.log(
          `Year ${yearsSimulated}: Humans: ${humanCount}, Lineages: ${
            Object.keys(lineages).length
          }, Bushes: ${bushCount}, Age(Avg:Max): ${avgHumanAge.toFixed(2)}:${maxHumanAge.toFixed(
            2,
          )}, Children: ${childCount}, Corpses: ${corpsesCount}, Gender Ratio (M:F): ${maleCount}:${
            humanCount - maleCount
          }, Avg Hunger: ${averageHunger.toFixed(2)}, Food (Berries:Meat): ${foodBerries}:${foodMeat}, Enemies: ${enemyPairs}`,
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
