import { describe, it, expect } from 'vitest';
import { createEntities, createHuman, createBerryBush, createTree } from './entities/entities-update';
import { updateWorld } from './world-update';
import { DebugPanelType, GameWorldState } from './world-types';
import { MAP_WIDTH, MAP_HEIGHT } from './game-consts';
import {
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREY_PROCREATION_COOLDOWN,
} from './animal-consts';
import { MIN_BERRY_BUSH_SPREAD_CHANCE } from './entities/plants/berry-bush/berry-bush-consts';
import { TREE_GROWTH_TIME_GAME_HOURS } from './entities/plants/tree/tree-consts';
import { createTutorial, createTutorialState } from './tutorial';
import { INITIAL_MASTER_VOLUME } from './sound-consts';
import { createSoilDepletionState } from './entities/plants/soil-depletion-types';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_COLORS } from './entities/tribe/territory-consts';
import { initTemperatureState } from './temperature/temperature-update';
import { indexWorldState, indexTasks } from './world-index/world-state-index';
import { IndexedWorldState } from './world-index/world-index-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { entitiesUpdate } from './entities/entities-update';
import { interactionsUpdate } from './interactions/interactions-update';
import { TRIBE_BADGE_EMOJIS } from './ui/ui-consts';
import { AIType } from './ai/ai-types';

/**
 * Performance test profiling data structure
 */
interface PerformanceProfile {
  indexWorldState: number;
  entitiesUpdate: number;
  interactionsUpdate: number;
  totalUpdateWorld: number;
  entityCounts: {
    humans: number;
    berryBushes: number;
    trees: number;
    total: number;
  };
}

/**
 * Creates a test world with a specified number of humans for performance testing.
 * This creates a world with multiple tribes spread across the map.
 */
function createLargeScaleWorld(humanCount: number, bushCount: number = 200, treeCount: number = 100): GameWorldState {
  const entities = createEntities();
  const initialTime = 0;

  // Create tribes (groups of 10-20 humans)
  const tribesCount = Math.ceil(humanCount / 15);
  const humansPerTribe = Math.ceil(humanCount / tribesCount);

  for (let tribeIndex = 0; tribeIndex < tribesCount; tribeIndex++) {
    // Random tribe center
    const tribeCenterX = Math.random() * MAP_WIDTH;
    const tribeCenterY = Math.random() * MAP_HEIGHT;

    // Create tribe leader (first male)
    const leader = createHuman(
      entities,
      { x: tribeCenterX, y: tribeCenterY },
      initialTime,
      'male',
      tribeIndex === 0, // First tribe has the player
      25, // Adult age
      50, // Initial hunger
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      AIType.TaskBased,
    );
    leader.leaderId = leader.id;
    leader.tribeInfo = {
      tribeBadge: TRIBE_BADGE_EMOJIS[tribeIndex % TRIBE_BADGE_EMOJIS.length],
      tribeColor: TERRITORY_COLORS[tribeIndex % TERRITORY_COLORS.length],
    };

    // Create remaining tribe members
    for (let i = 1; i < humansPerTribe && (tribeIndex * humansPerTribe + i) < humanCount; i++) {
      const angle = (i / humansPerTribe) * Math.PI * 2;
      const radius = 50 + Math.random() * 150; // Spread within 50-200 units of tribe center
      const x = tribeCenterX + Math.cos(angle) * radius;
      const y = tribeCenterY + Math.sin(angle) * radius;

      const gender = Math.random() < 0.5 ? 'male' : 'female';
      const age = 18 + Math.random() * 30; // Adults between 18 and 48

      const human = createHuman(
        entities,
        { x, y },
        initialTime,
        gender,
        false,
        age,
        50 + Math.random() * 50, // Varied hunger levels
        undefined,
        undefined,
        [],
        leader.id,
        leader.tribeInfo,
        AIType.TaskBased,
      );
      human.leaderId = leader.id;
      human.tribeInfo = leader.tribeInfo;
    }
  }

  // Create berry bushes spread across the map
  for (let i = 0; i < bushCount; i++) {
    createBerryBush(
      entities,
      { x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT },
      initialTime,
    );
  }

  // Create trees spread across the map
  for (let i = 0; i < treeCount; i++) {
    createTree(
      entities,
      { x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT },
      initialTime,
      Math.random() < 0.5 ? TREE_GROWTH_TIME_GAME_HOURS : 0, // Some mature, some growing
    );
  }

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const gameState: GameWorldState = {
    time: initialTime,
    entities,
    mapDimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
    generationCount: 1,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    scheduledEvents: [],
    nextScheduledEventId: 1,
    viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: true,
        planting: true,
        gathering: true,
        attack: true,
        feedChildren: true,
        build: true,
        roleManagement: true,
        chopping: true,
      },
      isManuallyMoving: false,
    },
    buildMenuOpen: false,
    roleManagerOpen: false,
    armyControlOpen: false,
    selectedBuildingType: null,
    selectedBuildingForRemoval: null,
    hasPlayerMovedEver: true,
    hasPlayerPlantedBush: true,
    hasPlayerEnabledAutopilot: 7,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true,
    uiButtons: [],
    tutorial,
    tutorialState,
    debugPanel: DebugPanelType.None,
    debugPanelScroll: { x: 0, y: 0 },
    isDraggingDebugPanel: false,
    performanceMetrics: {
      currentBucket: { renderTime: 0, worldUpdateTime: 0, aiUpdateTime: 0 },
      history: [],
    },
    notifications: [],
    ecosystem: {
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
    },
    soilDepletion: createSoilDepletionState(),
    temperature: initTemperatureState(MAP_WIDTH, MAP_HEIGHT),
    autosaveIntervalSeconds: 0, // Disable autosave for tests
    lastAutosaveTime: 0,
    plantingZoneConnections: {},
    terrainOwnership: new Array(
      Math.ceil(MAP_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(MAP_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
    tasks: {},
  };

  return indexWorldState(gameState);
}

/**
 * Profiles individual components of the updateWorld function
 */
function profileUpdateComponents(gameState: GameWorldState, iterations: number): PerformanceProfile {
  const indexTimes: number[] = [];
  const entitiesUpdateTimes: number[] = [];
  const interactionsUpdateTimes: number[] = [];
  const totalUpdateTimes: number[] = [];

  const deltaTime = 1 / 60; // 60 FPS simulation

  for (let i = 0; i < iterations; i++) {
    // Profile indexWorldState
    let start = performance.now();
    const indexedState = indexWorldState(gameState);
    indexTimes.push(performance.now() - start);

    // Profile entitiesUpdate
    const updateContext = { gameState: indexedState, deltaTime };
    start = performance.now();
    entitiesUpdate(updateContext);
    entitiesUpdateTimes.push(performance.now() - start);

    // Profile interactionsUpdate
    start = performance.now();
    interactionsUpdate(updateContext);
    interactionsUpdateTimes.push(performance.now() - start);

    // Profile total updateWorld
    start = performance.now();
    gameState = updateWorld(gameState, deltaTime);
    totalUpdateTimes.push(performance.now() - start);
  }

  const indexedState = gameState as IndexedWorldState;

  return {
    indexWorldState: indexTimes.reduce((a, b) => a + b, 0) / iterations,
    entitiesUpdate: entitiesUpdateTimes.reduce((a, b) => a + b, 0) / iterations,
    interactionsUpdate: interactionsUpdateTimes.reduce((a, b) => a + b, 0) / iterations,
    totalUpdateWorld: totalUpdateTimes.reduce((a, b) => a + b, 0) / iterations,
    entityCounts: {
      humans: indexedState.search.human.count(),
      berryBushes: indexedState.search.berryBush.count(),
      trees: indexedState.search.tree.count(),
      total: Object.keys(gameState.entities.entities).length,
    },
  };
}

/**
 * Detailed profiling of entity update phases
 */
async function profileEntityUpdatePhases(gameState: GameWorldState, iterations: number): Promise<Record<string, number>> {
  const physicsTime: number[] = [];
  const prepareAiTime: number[] = [];
  const indexTasksTime: number[] = [];
  const executeAiTime: number[] = [];

  const deltaTime = 1 / 60;

  for (let i = 0; i < iterations; i++) {
    const indexedState = indexWorldState(gameState);
    const updateContext = { gameState: indexedState, deltaTime };
    const entities = indexedState.entities.entities;

    // Import the entity update function
    const { entityUpdate, EntityUpdatePhase } = await import('./entities/entity-update');

    // Physics phase
    let start = performance.now();
    for (const id in entities) {
      entityUpdate(entities[id], updateContext, EntityUpdatePhase.Physics);
    }
    physicsTime.push(performance.now() - start);

    // Prepare AI phase
    start = performance.now();
    for (const id in entities) {
      entityUpdate(entities[id], updateContext, EntityUpdatePhase.PrepareAI);
    }
    prepareAiTime.push(performance.now() - start);

    // Index tasks
    start = performance.now();
    indexTasks(indexedState);
    indexTasksTime.push(performance.now() - start);

    // Execute AI phase
    start = performance.now();
    for (const id in entities) {
      entityUpdate(entities[id], updateContext, EntityUpdatePhase.ExecuteAI);
    }
    executeAiTime.push(performance.now() - start);

    gameState = indexedState;
  }

  return {
    physicsPhase: physicsTime.reduce((a, b) => a + b, 0) / iterations,
    prepareAiPhase: prepareAiTime.reduce((a, b) => a + b, 0) / iterations,
    indexTasks: indexTasksTime.reduce((a, b) => a + b, 0) / iterations,
    executeAiPhase: executeAiTime.reduce((a, b) => a + b, 0) / iterations,
  };
}

describe('Performance Test Suite - updateWorld with 1k+ humans', () => {
  it('should profile updateWorld with 1000 humans', () => {
    console.log('\n=== Performance Test: 1000 Humans ===\n');

    const gameState = createLargeScaleWorld(1000, 300, 150);
    const profile = profileUpdateComponents(gameState, 10);

    console.log('Entity Counts:', profile.entityCounts);
    console.log('\nComponent Timings (average ms per frame):');
    console.log(`  indexWorldState:    ${profile.indexWorldState.toFixed(3)} ms`);
    console.log(`  entitiesUpdate:     ${profile.entitiesUpdate.toFixed(3)} ms`);
    console.log(`  interactionsUpdate: ${profile.interactionsUpdate.toFixed(3)} ms`);
    console.log(`  totalUpdateWorld:   ${profile.totalUpdateWorld.toFixed(3)} ms`);

    // Calculate percentages
    const total = profile.indexWorldState + profile.entitiesUpdate + profile.interactionsUpdate;
    console.log('\nComponent Breakdown (% of profiled components):');
    console.log(`  indexWorldState:    ${((profile.indexWorldState / total) * 100).toFixed(1)}%`);
    console.log(`  entitiesUpdate:     ${((profile.entitiesUpdate / total) * 100).toFixed(1)}%`);
    console.log(`  interactionsUpdate: ${((profile.interactionsUpdate / total) * 100).toFixed(1)}%`);

    // Performance thresholds - 60 FPS means 16.67ms budget per frame
    // We want updateWorld to stay under 10ms to leave room for rendering
    expect(profile.totalUpdateWorld).toBeLessThan(100); // Relaxed threshold for CI

    // Store results for analysis
    console.log('\n--- Raw Profile Data ---');
    console.log(JSON.stringify(profile, null, 2));
  }, 120000);

  it('should profile entity update phases with 1000 humans', async () => {
    console.log('\n=== Entity Update Phase Analysis: 1000 Humans ===\n');

    const gameState = createLargeScaleWorld(1000, 300, 150);
    const phaseProfile = await profileEntityUpdatePhases(gameState, 5);

    console.log('Entity Update Phase Timings (average ms per frame):');
    console.log(`  Physics Phase:    ${phaseProfile.physicsPhase.toFixed(3)} ms`);
    console.log(`  Prepare AI Phase: ${phaseProfile.prepareAiPhase.toFixed(3)} ms`);
    console.log(`  Index Tasks:      ${phaseProfile.indexTasks.toFixed(3)} ms`);
    console.log(`  Execute AI Phase: ${phaseProfile.executeAiPhase.toFixed(3)} ms`);

    const total = Object.values(phaseProfile).reduce((a, b) => a + b, 0);
    console.log(`\n  Total:            ${total.toFixed(3)} ms`);

    console.log('\nPhase Breakdown (%):');
    for (const [phase, time] of Object.entries(phaseProfile)) {
      console.log(`  ${phase}: ${((time / total) * 100).toFixed(1)}%`);
    }

    // Verify test ran successfully
    expect(phaseProfile.physicsPhase).toBeGreaterThan(0);
  }, 120000);

  it('should compare performance scaling from 500 to 2000 humans', () => {
    console.log('\n=== Performance Scaling Analysis ===\n');

    const scales = [500, 1000, 1500, 2000];
    const results: { humanCount: number; profile: PerformanceProfile }[] = [];

    for (const count of scales) {
      console.log(`Testing with ${count} humans...`);
      const gameState = createLargeScaleWorld(count, count * 0.3, count * 0.15);
      const profile = profileUpdateComponents(gameState, 5);
      results.push({ humanCount: count, profile });
    }

    console.log('\n=== Scaling Results ===');
    console.log('Human Count | Total Update (ms) | Index (ms) | Entities (ms) | Interactions (ms)');
    console.log('-'.repeat(85));

    for (const { humanCount, profile } of results) {
      console.log(
        `${humanCount.toString().padStart(11)} | ` +
          `${profile.totalUpdateWorld.toFixed(3).padStart(17)} | ` +
          `${profile.indexWorldState.toFixed(3).padStart(10)} | ` +
          `${profile.entitiesUpdate.toFixed(3).padStart(13)} | ` +
          `${profile.interactionsUpdate.toFixed(3).padStart(17)}`,
      );
    }

    // Calculate scaling factors
    if (results.length >= 2) {
      const first = results[0];
      const last = results[results.length - 1];
      const humanScaleFactor = last.humanCount / first.humanCount;
      const timeScaleFactor = last.profile.totalUpdateWorld / first.profile.totalUpdateWorld;

      console.log(`\nScaling Analysis:`);
      console.log(`  Human count scaled by: ${humanScaleFactor.toFixed(1)}x`);
      console.log(`  Update time scaled by: ${timeScaleFactor.toFixed(1)}x`);
      console.log(`  Complexity factor: O(n^${(Math.log(timeScaleFactor) / Math.log(humanScaleFactor)).toFixed(2)})`);
    }

    // Verify test completed
    expect(results.length).toBe(scales.length);
  }, 300000);

  it('should identify memory and object allocation patterns', () => {
    console.log('\n=== Memory Analysis ===\n');

    const gameState = createLargeScaleWorld(1000, 300, 150);
    const deltaTime = 1 / 60;

    // Run garbage collection if available (Node.js --expose-gc flag)
    const gc = (globalThis as unknown as { gc?: () => void }).gc;
    if (gc) {
      gc();
    }

    const beforeHeap = process.memoryUsage().heapUsed;
    let currentState = gameState;

    // Run 100 update cycles
    for (let i = 0; i < 100; i++) {
      currentState = updateWorld(currentState, deltaTime);
    }

    const afterHeap = process.memoryUsage().heapUsed;
    const heapGrowth = afterHeap - beforeHeap;

    console.log(`Heap before: ${(beforeHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap after:  ${(afterHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB over 100 frames`);
    console.log(`Avg growth per frame: ${(heapGrowth / 100 / 1024).toFixed(2)} KB`);

    // Verify test ran
    expect(currentState.time).toBeGreaterThan(gameState.time);
  }, 120000);
});

describe('Performance Bottleneck Identification', () => {
  it('should identify the top performance bottlenecks', () => {
    console.log('\n=== Bottleneck Identification ===\n');

    const gameState = createLargeScaleWorld(1000, 300, 150);
    const indexedState = indexWorldState(gameState);
    const deltaTime = 1 / 60;

    const bottlenecks: { component: string; time: number; percentage: number }[] = [];

    // Profile indexing
    let start = performance.now();
    for (let i = 0; i < 10; i++) {
      indexWorldState(gameState);
    }
    const indexTime = (performance.now() - start) / 10;
    bottlenecks.push({ component: 'indexWorldState', time: indexTime, percentage: 0 });

    // Profile entity categorization within indexing
    start = performance.now();
    for (let i = 0; i < 10; i++) {
      const entities = gameState.entities.entities;
      const humans: HumanEntity[] = [];
      for (const id in entities) {
        if (entities[id].type === 'human') {
          humans.push(entities[id] as HumanEntity);
        }
      }
    }
    const categorizationTime = (performance.now() - start) / 10;
    bottlenecks.push({ component: 'Entity categorization', time: categorizationTime, percentage: 0 });

    // Profile interactions
    const updateContext = { gameState: indexedState, deltaTime };
    start = performance.now();
    for (let i = 0; i < 10; i++) {
      interactionsUpdate(updateContext);
    }
    const interactionTime = (performance.now() - start) / 10;
    bottlenecks.push({ component: 'interactionsUpdate', time: interactionTime, percentage: 0 });

    // Profile entitiesUpdate
    start = performance.now();
    for (let i = 0; i < 10; i++) {
      entitiesUpdate(updateContext);
    }
    const entitiesTime = (performance.now() - start) / 10;
    bottlenecks.push({ component: 'entitiesUpdate', time: entitiesTime, percentage: 0 });

    // Calculate total and percentages
    const total = bottlenecks.reduce((sum, b) => sum + b.time, 0);
    bottlenecks.forEach((b) => {
      b.percentage = (b.time / total) * 100;
    });

    // Sort by time descending
    bottlenecks.sort((a, b) => b.time - a.time);

    console.log('Top Bottlenecks (sorted by time):');
    console.log('-'.repeat(60));
    bottlenecks.forEach((b, i) => {
      console.log(
        `${(i + 1).toString().padStart(2)}. ${b.component.padEnd(25)} ${b.time.toFixed(3).padStart(10)} ms (${b.percentage.toFixed(1).padStart(5)}%)`,
      );
    });

    // Verify identification completed
    expect(bottlenecks.length).toBeGreaterThan(0);
  }, 60000);
});
