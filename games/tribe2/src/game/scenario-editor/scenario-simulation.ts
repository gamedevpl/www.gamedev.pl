/**
 * Simulation utilities for the Scenario Editor.
 * Allows running the game simulation on a scenario to create more organic states.
 */

import { ScenarioConfig, ScenarioTribe, ScenarioBerryBush, ScenarioPrey, ScenarioPredator, ScenarioBuilding, generateScenarioId } from './scenario-types';
import { GameWorldState, DebugPanelType } from '../world-types';
import { createEntities, createBerryBush, createHuman, createPrey, createPredator, createBuilding } from '../entities/entities-update';
import { updateWorld } from '../world-update';
import { indexWorldState } from '../world-index/world-state-index';
import { createTutorial, createTutorialState } from '../tutorial';
import { createSoilDepletionState } from '../entities/plants/soil-depletion-types';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../entities/tribe/territory-consts';
import { paintTerrainOwnership } from '../entities/tribe/territory-utils';
import { INITIAL_MASTER_VOLUME } from '../sound-consts';
import { generateRandomPreyGeneCode } from '../entities/characters/prey/prey-utils';
import { generateRandomPredatorGeneCode } from '../entities/characters/predator/predator-utils';
import {
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_PROCREATION_COOLDOWN,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
} from '../animal-consts';
import { MIN_BERRY_BUSH_SPREAD_CHANCE } from '../entities/plants/berry-bush/berry-bush-consts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { EntityId } from '../entities/entities-types';
import { ClickableUIButton, UIButtonActionType } from '../ui/ui-types';
import { UI_BUTTON_WIDTH, UI_BUTTON_TEXT_COLOR } from '../ui/ui-consts';
import { NotificationType } from '../notifications/notification-types';
import { findPlayerEntity } from '../utils';

/**
 * Converts a ScenarioConfig into a GameWorldState for simulation.
 */
export function scenarioConfigToGameState(config: ScenarioConfig): GameWorldState {
  const entities = createEntities();
  const initialTime = 0;

  // Create berry bushes
  for (const bush of config.berryBushes) {
    createBerryBush(entities, bush.position, initialTime);
  }

  // Create prey
  for (const prey of config.prey) {
    createPrey(entities, prey.position, prey.gender, undefined, undefined, generateRandomPreyGeneCode());
  }

  // Create predators
  for (const predator of config.predators) {
    createPredator(entities, predator.position, predator.gender, undefined, undefined, generateRandomPredatorGeneCode());
  }

  // Map to store scenario tribe ID -> entity leader ID
  const tribeLeaderMap: Record<string, EntityId> = {};

  // Create humans - first pass: create leaders
  for (const tribe of config.tribes) {
    const leader = tribe.humans.find(h => h.isLeader);
    if (leader) {
      const human = createHuman(
        entities,
        leader.position,
        initialTime,
        leader.gender,
        leader.isPlayer || false,
        leader.age,
      );
      human.leaderId = human.id;
      human.tribeBadge = tribe.badge;
      tribeLeaderMap[tribe.id] = human.id;
    }
  }

  // Create humans - second pass: create non-leaders
  for (const tribe of config.tribes) {
    const leaderId = tribeLeaderMap[tribe.id];
    for (const scenarioHuman of tribe.humans) {
      if (!scenarioHuman.isLeader) {
        const human = createHuman(
          entities,
          scenarioHuman.position,
          initialTime,
          scenarioHuman.gender,
          scenarioHuman.isPlayer || false,
          scenarioHuman.age,
        );
        human.leaderId = leaderId;
        human.tribeBadge = tribe.badge;
      }
    }
  }

  // Create buildings
  const buildingsToClaimTerritory: { position: { x: number; y: number }; ownerId: EntityId }[] = [];
  for (const building of config.buildings) {
    const leaderId = tribeLeaderMap[building.tribeId];
    if (leaderId) {
      const b = createBuilding(entities, building.position, building.type, leaderId);
      if (building.isConstructed) {
        b.isConstructed = true;
        b.constructionProgress = 1;
        // Store building info to paint territory after game state is created
        buildingsToClaimTerritory.push({ position: building.position, ownerId: leaderId });
      }
    }
  }

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const gameState: GameWorldState = {
    time: initialTime,
    entities,
    mapDimensions: {
      width: config.mapWidth,
      height: config.mapHeight,
    },
    generationCount: 1,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    viewportCenter: config.playerStartPosition || { x: config.mapWidth / 2, y: config.mapHeight / 2 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        build: false,
        roleManagement: true,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    buildMenuOpen: false,
    roleManagerOpen: false,
    armyControlOpen: false,
    selectedBuildingType: null,
    selectedBuildingForRemoval: null,
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true,
    uiButtons: [],
    tutorial,
    tutorialState,
    debugPanel: DebugPanelType.None,
    debugPanelScroll: { x: 0, y: 0 },
    isDraggingDebugPanel: false,
    performanceMetrics: {
      currentBucket: {
        renderTime: 0,
        worldUpdateTime: 0,
        aiUpdateTime: 0,
      },
      history: [],
    },
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [],
    ecosystem: {
      ...{
        preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
        preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
        predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
        predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
        preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
        predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
        berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
      },
      ...config.ecosystemSettings,
    },
    soilDepletion: createSoilDepletionState(),
    lastAutosaveTime: 0,
    plantingZoneConnections: {},
    terrainOwnership: new Array(
      Math.ceil(config.mapWidth / TERRITORY_OWNERSHIP_RESOLUTION) * Math.ceil(config.mapHeight / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  };

  // Paint territory for all constructed buildings
  // This must be done after terrainOwnership array is created
  for (const buildingInfo of buildingsToClaimTerritory) {
    paintTerrainOwnership(buildingInfo.position, TERRITORY_BUILDING_RADIUS, buildingInfo.ownerId, gameState);
  }

  return indexWorldState(gameState);
}

/**
 * Creates a playable game state from a scenario config.
 * This includes UI buttons, notifications, and proper settings for actual gameplay.
 */
export function createPlayableGameState(config: ScenarioConfig): GameWorldState {
  // Get base game state from scenario
  const baseState = scenarioConfigToGameState(config);
  
  // Create UI buttons for the game
  const uiButtons: ClickableUIButton[] = [
    {
      id: 'muteButton',
      action: UIButtonActionType.ToggleMute,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: '',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'pauseButton',
      action: UIButtonActionType.TogglePause,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: '',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'returnToIntroButton',
      action: UIButtonActionType.ReturnToIntro,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: 'EXIT',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
  ];

  // Find the player entity to center viewport and create welcome notification
  const player = findPlayerEntity(baseState);
  
  const notifications = player ? [
    {
      id: 'welcome',
      type: NotificationType.Hello,
      message: `Welcome to ${config.name}!`,
      duration: 50,
      targetEntityIds: [player.id],
      highlightedEntityIds: [player.id],
      timestamp: 0,
      isDismissed: false,
      creationTime: Date.now(),
    },
  ] : [];

  // Update the state with game-specific settings
  return {
    ...baseState,
    uiButtons,
    notifications,
    isMuted: false, // Enable sound for actual gameplay
    viewportCenter: player?.position || baseState.viewportCenter,
    autosaveIntervalSeconds: 5,
    lastAutosaveTime: Date.now(),
  };
}

/**
 * Converts a GameWorldState back into a ScenarioConfig.
 */
export function gameStateToScenarioConfig(gameState: GameWorldState, baseName: string = 'Simulated Scenario'): ScenarioConfig {
  const entities = Object.values(gameState.entities.entities);
  
  // Extract humans and group by tribe
  const humans = entities.filter((e): e is HumanEntity => e.type === 'human');
  const tribeMap = new Map<EntityId, { badge: string; humans: HumanEntity[] }>();
  
  for (const human of humans) {
    const leaderId = human.leaderId || human.id;
    if (!tribeMap.has(leaderId)) {
      tribeMap.set(leaderId, { badge: human.tribeBadge || '👑', humans: [] });
    }
    tribeMap.get(leaderId)!.humans.push(human);
  }

  // Map from entity leaderId to scenario tribeId
  const leaderToTribeIdMap = new Map<EntityId, string>();

  const tribes: ScenarioTribe[] = [];
  for (const [leaderId, tribeData] of tribeMap.entries()) {
    const leader = tribeData.humans.find(h => h.id === leaderId);
    const tribeId = generateScenarioId();
    
    // Store mapping for building association
    leaderToTribeIdMap.set(leaderId, tribeId);
    
    tribes.push({
      id: tribeId,
      badge: tribeData.badge,
      position: leader?.position || tribeData.humans[0]?.position || { x: 0, y: 0 },
      humans: tribeData.humans.map(h => ({
        id: generateScenarioId(),
        gender: h.gender,
        age: h.age,
        isPlayer: h.isPlayer || false,
        isLeader: h.id === leaderId,
        position: { ...h.position },
        tribeId,
      })),
    });
  }

  // Extract berry bushes
  const berryBushes: ScenarioBerryBush[] = entities
    .filter((e): e is BerryBushEntity => e.type === 'berryBush')
    .map(b => ({
      id: generateScenarioId(),
      position: { ...b.position },
    }));

  // Extract prey
  const prey: ScenarioPrey[] = entities
    .filter((e): e is PreyEntity => e.type === 'prey')
    .map(p => ({
      id: generateScenarioId(),
      gender: p.gender,
      position: { ...p.position },
    }));

  // Extract predators
  const predators: ScenarioPredator[] = entities
    .filter((e): e is PredatorEntity => e.type === 'predator')
    .map(p => ({
      id: generateScenarioId(),
      gender: p.gender,
      position: { ...p.position },
    }));

  // Extract buildings
  const buildings: ScenarioBuilding[] = entities
    .filter((e): e is BuildingEntity => e.type === 'building')
    .map(b => {
      // Find the tribe that owns this building using the leader mapping
      const ownerHuman = humans.find(h => h.id === b.ownerId);
      const ownerLeaderId = ownerHuman?.leaderId || ownerHuman?.id;
      const scenarioTribeId = ownerLeaderId ? leaderToTribeIdMap.get(ownerLeaderId) : undefined;
      
      return {
        id: generateScenarioId(),
        type: b.buildingType,
        position: { ...b.position },
        tribeId: scenarioTribeId || '',
        isConstructed: b.isConstructed,
      };
    });

  return {
    name: baseName,
    description: `Simulated for ${gameState.time.toFixed(1)} game hours`,
    mapWidth: gameState.mapDimensions.width,
    mapHeight: gameState.mapDimensions.height,
    tribes,
    berryBushes,
    prey,
    predators,
    buildings,
    ecosystemSettings: {},
    playerStartPosition: gameState.viewportCenter,
    playerTribeId: undefined,
  };
}

/**
 * Runs the simulation for a specified duration.
 * @param config The scenario configuration to simulate
 * @param durationGameHours How many game hours to simulate
 * @param onProgress Optional callback to report progress (0-100)
 * @returns The resulting scenario configuration after simulation
 */
export function runSimulation(
  config: ScenarioConfig,
  durationGameHours: number,
  onProgress?: (percent: number) => void,
): ScenarioConfig {
  // Convert config to game state
  let gameState = scenarioConfigToGameState(config);
  
  // Calculate simulation parameters
  // In the game: HOURS_PER_GAME_DAY = 24, GAME_DAY_IN_REAL_SECONDS = 10
  // So 1 game hour = 10/24 real seconds ≈ 0.417 real seconds
  // We'll simulate in steps
  const SIMULATION_STEP_REAL_SECONDS = 0.1; // 100ms per step
  const GAME_HOURS_PER_STEP = SIMULATION_STEP_REAL_SECONDS * (24 / 10); // ~0.24 game hours per step
  
  const totalSteps = Math.ceil(durationGameHours / GAME_HOURS_PER_STEP);
  
  for (let step = 0; step < totalSteps; step++) {
    gameState = updateWorld(gameState, SIMULATION_STEP_REAL_SECONDS);
    
    if (onProgress && step % 10 === 0) {
      onProgress(Math.min(100, (step / totalSteps) * 100));
    }
    
    // Check for game over
    if (gameState.gameOver) {
      break;
    }
  }
  
  if (onProgress) {
    onProgress(100);
  }
  
  // Convert back to scenario config
  return gameStateToScenarioConfig(gameState, config.name);
}

/**
 * Runs simulation asynchronously in chunks to avoid blocking the UI.
 * Uses requestAnimationFrame-based batching for smooth progress updates.
 */
export async function runSimulationAsync(
  config: ScenarioConfig,
  durationGameHours: number,
  onProgress?: (percent: number) => void,
): Promise<ScenarioConfig> {
  return new Promise((resolve) => {
    let gameState = scenarioConfigToGameState(config);
    
    const SIMULATION_STEP_REAL_SECONDS = 0.1;
    const GAME_HOURS_PER_STEP = SIMULATION_STEP_REAL_SECONDS * (24 / 10);
    const totalSteps = Math.ceil(durationGameHours / GAME_HOURS_PER_STEP);
    const STEPS_PER_CHUNK = 50; // Process 50 steps per frame
    
    let currentStep = 0;
    
    const processChunk = () => {
      const chunkEnd = Math.min(currentStep + STEPS_PER_CHUNK, totalSteps);
      
      for (; currentStep < chunkEnd; currentStep++) {
        gameState = updateWorld(gameState, SIMULATION_STEP_REAL_SECONDS);
        
        if (gameState.gameOver) {
          currentStep = totalSteps; // Force exit
          break;
        }
      }
      
      if (onProgress) {
        onProgress(Math.min(100, (currentStep / totalSteps) * 100));
      }
      
      if (currentStep < totalSteps) {
        // Schedule next chunk
        requestAnimationFrame(processChunk);
      } else {
        // Simulation complete
        resolve(gameStateToScenarioConfig(gameState, config.name));
      }
    };
    
    // Start processing
    requestAnimationFrame(processChunk);
  });
}

/**
 * Runs continuous simulation that updates the scenario in real-time.
 * The simulation runs indefinitely until stopped via the shouldStop callback.
 * Uses setTimeout to allow browser to handle other tasks between batches.
 */
export async function runContinuousSimulation(
  initialConfig: ScenarioConfig,
  onUpdate: (result: ScenarioConfig) => void,
  shouldStop: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    let gameState = scenarioConfigToGameState(initialConfig);
    
    const SIMULATION_STEP_REAL_SECONDS = 0.1;
    const STEPS_PER_UPDATE = 10; // Update the scenario every 10 steps
    const BATCH_DELAY_MS = 16; // ~60fps, allows browser to handle other tasks
    
    const processStep = () => {
      if (shouldStop() || gameState.gameOver) {
        // Final update before stopping
        onUpdate(gameStateToScenarioConfig(gameState, initialConfig.name));
        resolve();
        return;
      }
      
      // Run simulation steps
      for (let i = 0; i < STEPS_PER_UPDATE; i++) {
        gameState = updateWorld(gameState, SIMULATION_STEP_REAL_SECONDS);
        
        if (gameState.gameOver) {
          break;
        }
      }
      
      // Update the scenario config periodically
      onUpdate(gameStateToScenarioConfig(gameState, initialConfig.name));
      
      // Schedule next batch with setTimeout to allow browser to breathe
      setTimeout(processStep, BATCH_DELAY_MS);
    };
    
    // Start processing
    setTimeout(processStep, 0);
  });
}
