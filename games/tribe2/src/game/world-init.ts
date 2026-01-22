import {
  createEntities,
  createBerryBush,
  createHuman,
  createPrey,
  createPredator,
  createTree,
} from './entities/entities-update';
import { DebugPanelType, GameWorldState } from './world-types';
import { MAP_WIDTH, MAP_HEIGHT, INTRO_SCREEN_INITIAL_HUMANS, INITIAL_TREE_COUNT } from './game-consts.ts';
import {
  INITIAL_BERRY_BUSH_COUNT,
  MIN_BERRY_BUSH_SPREAD_CHANCE,
} from './entities/plants/berry-bush/berry-bush-consts.ts';
import { INITIAL_MASTER_VOLUME } from './sound-consts.ts';
import { UI_BUTTON_WIDTH, UI_BUTTON_TEXT_COLOR, TRIBE_BADGE_EMOJIS } from './ui/ui-consts.ts';
import {
  INITIAL_PREY_COUNT,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_PROCREATION_COOLDOWN,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
} from './animal-consts.ts';
import { indexWorldState } from './world-index/world-state-index';
import { createTutorial, createTutorialState } from './tutorial';
import { ClickableUIButton, UIButtonActionType } from './ui/ui-types';
import { NotificationType } from './notifications/notification-types';
import { generateRandomPreyGeneCode } from './entities/characters/prey/prey-utils';
import { generateRandomPredatorGeneCode } from './entities/characters/predator/predator-utils';
import { createSoilDepletionState } from './entities/plants/soil-depletion-types.ts';
import { TERRITORY_COLORS, TERRITORY_OWNERSHIP_RESOLUTION } from './entities/tribe/territory-consts.ts';
import { TREE_GROWTH_TIME_GAME_HOURS, MIN_TREE_SPREAD_CHANCE } from './entities/plants/tree/tree-consts';
import { initTemperatureState } from './temperature/temperature-update';
import { AIType } from './ai/ai-types.ts';
import { initNavigationGrid, updateNavigationGridSector, NAVIGATION_AGENT_RADIUS } from './utils/navigation-utils';

export function initWorld(): GameWorldState {
  const entities = createEntities();
  const initialTime = 0; // Game starts at time 0

  // Spawn initial berry bushes
  for (let i = 0; i < INITIAL_BERRY_BUSH_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createBerryBush(entities, randomPosition, initialTime);
  }

  // Spawn initial trees (randomly distributed)
  for (let i = 0; i < INITIAL_TREE_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createTree(entities, randomPosition, initialTime);
  }

  // Define the center of the map for character spawning
  const centerX = MAP_WIDTH / 2;
  const centerY = MAP_HEIGHT / 2;

  // Spawn some mature trees near the player spawn for immediate visibility
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const radius = 100 + Math.random() * 100; // 100-200 pixels from center
    const spawnPosition = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
    createTree(entities, spawnPosition, initialTime, TREE_GROWTH_TIME_GAME_HOURS);
  }

  // Spawn player character (male) at center - player is their own tribe leader
  const player = createHuman(entities, { x: centerX - 25, y: centerY }, initialTime, 'male', true);

  // Spawn partner character (female) near the player - they join the player's tribe
  const partner = createHuman(
    entities,
    { x: centerX + 25, y: centerY },
    initialTime,
    'female',
    false, // isPlayer = false
  );
  partner.leaderId = player.id; // Partner joins player's tribe
  partner.tribeInfo = {
    tribeBadge: '👑',
    tribeColor: TERRITORY_COLORS[0],
  };
  player.aiType = AIType.TaskBased;
  partner.aiType = AIType.TaskBased;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const radiusX = MAP_WIDTH / 2;
    const radiusY = MAP_HEIGHT / 2;
    const spawnPosition = {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };

    // Spawn other tribes - each pair forms a tribe with male as leader
    const male = createHuman(
      entities,
      { x: spawnPosition.x, y: spawnPosition.y },
      initialTime,
      'male',
      false, // isPlayer = false
    );
    male.leaderId = male.id; // Male is the leader
    male.tribeInfo = {
      tribeBadge: TRIBE_BADGE_EMOJIS[i % TRIBE_BADGE_EMOJIS.length],
      tribeColor: TERRITORY_COLORS[i % TERRITORY_COLORS.length],
    };

    const female = createHuman(
      entities,
      { x: spawnPosition.x + 50, y: spawnPosition.y },
      initialTime,
      'female',
      false, // isPlayer = false
    );
    female.leaderId = male.id; // Female joins the tribe
    female.tribeInfo = male.tribeInfo;
  }

  // Spawn a pairs of prey at random positions
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const preyMalePosition = {
      x: centerX + MAP_WIDTH * (Math.random() - Math.random()),
      y: centerY + MAP_HEIGHT * (Math.random() - Math.random()),
    };
    createPrey(entities, preyMalePosition, 'male', undefined, undefined, generateRandomPreyGeneCode());
    createPrey(
      entities,
      { x: preyMalePosition.x + 20, y: preyMalePosition.y },
      'female',
      undefined,
      undefined,
      generateRandomPreyGeneCode(),
    );
  }

  // Spawn a pair of predators
  const predatorMalePosition = {
    x: centerX + MAP_WIDTH * (Math.random() - Math.random()),
    y: centerY + MAP_HEIGHT * (Math.random() - Math.random()),
  };
  createPredator(entities, predatorMalePosition, 'male', undefined, undefined, generateRandomPredatorGeneCode());
  createPredator(
    entities,
    { x: predatorMalePosition.x + 20, y: predatorMalePosition.y },
    'female',
    undefined,
    undefined,
    generateRandomPredatorGeneCode(),
  );

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

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    generationCount: 1, // Start with generation 1 as per GDD context for player
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    scheduledEvents: [],
    nextScheduledEventId: 1,
    viewportCenter: { ...player.position },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    tribeModalOpen: false,
    strategicMenuOpen: false,
    cameraFollowingPlayer: true,
    cameraZoom: 1,
    hoveredMinimapTribeId: null,
    minimapRect: { x: 0, y: 0, width: 0, height: 0 },
    isDraggingMinimap: false,
    minimapDragDistance: 0,
    isDraggingViewport: false,
    viewportDragButton: null,
    viewportDragDistance: 0,
    selectedBuildingForRemoval: null,
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: false,
    uiButtons,
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
    notifications: [
      {
        id: 'welcome',
        type: NotificationType.Hello,
        message: 'Welcome to the game!',
        duration: 50,
        targetEntityIds: [player.id],
        highlightedEntityIds: [player.id],
        timestamp: 0,
        isDismissed: false,
        creationTime: Date.now(),
      },
    ],
    ecosystem: {
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
      treeSpreadChance: MIN_TREE_SPREAD_CHANCE,
    },
    soilDepletion: createSoilDepletionState(),
    temperature: initTemperatureState(MAP_WIDTH, MAP_HEIGHT),
    autosaveIntervalSeconds: 5,
    lastAutosaveTime: Date.now(),
    plantingZoneConnections: {},
    terrainOwnership: new Array(
      Math.ceil(MAP_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) * Math.ceil(MAP_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
    navigationGrid: initNavigationGrid(MAP_WIDTH, MAP_HEIGHT),
    pathfindingQueue: [],
    tasks: {},
    buildingVersion: 0,
  };

  // Populate navigation grid with initial obstacles (trees)
  Object.values(initialWorldState.entities.entities).forEach((entity) => {
    if (entity.type === 'tree') {
      updateNavigationGridSector(
        initialWorldState,
        entity.position,
        entity.radius,
        true,
        null,
        NAVIGATION_AGENT_RADIUS,
      );
    }
  });

  const indexedWorldState = indexWorldState(initialWorldState);

  console.log('Game world initialized:', indexedWorldState);

  return indexedWorldState;
}

export function initIntroWorld(): GameWorldState {
  const entities = createEntities();
  const initialTime = 0;

  // Spawn initial berry bushes
  for (let i = 0; i < INITIAL_BERRY_BUSH_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createBerryBush(entities, randomPosition, initialTime);
  }

  // Spawn initial trees (randomly distributed)
  for (let i = 0; i < INITIAL_TREE_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createTree(entities, randomPosition, initialTime);
  }

  // Spawn some mature trees near the map center for intro screen interest
  const centerX = MAP_WIDTH / 2;
  const centerY = MAP_HEIGHT / 2;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const radius = 100 + Math.random() * 100;
    const spawnPosition = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
    createTree(entities, spawnPosition, initialTime, TREE_GROWTH_TIME_GAME_HOURS);
  }

  // Spawn initial AI humans
  for (let i = 0; i < INTRO_SCREEN_INITIAL_HUMANS; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    createHuman(entities, randomPosition, initialTime, gender, false);
  }

  // Spawn a pairs of prey at random positions
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const preyMalePosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createPrey(entities, preyMalePosition, 'male', undefined, undefined, generateRandomPreyGeneCode());
    createPrey(
      entities,
      { x: preyMalePosition.x + 20, y: preyMalePosition.y },
      'female',
      undefined,
      undefined,
      generateRandomPreyGeneCode(),
    );
  }

  // Spawn a pair of predators
  const predatorMalePosition = {
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
  };
  createPredator(entities, predatorMalePosition, 'male', undefined, undefined, generateRandomPredatorGeneCode());
  createPredator(
    entities,
    { x: predatorMalePosition.x + 20, y: predatorMalePosition.y },
    'female',
    undefined,
    undefined,
    generateRandomPredatorGeneCode(),
  );

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    generationCount: 0,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    scheduledEvents: [],
    nextScheduledEventId: 1,
    viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    tribeModalOpen: false,
    strategicMenuOpen: false,
    cameraFollowingPlayer: true,
    cameraZoom: 1,
    hoveredMinimapTribeId: null,
    minimapRect: { x: 0, y: 0, width: 0, height: 0 },
    isDraggingMinimap: false,
    minimapDragDistance: 0,
    isDraggingViewport: false,
    viewportDragButton: null,
    viewportDragDistance: 0,
    selectedBuildingForRemoval: null,
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true, // Muted by default for the intro
    uiButtons: [], // No UI buttons in the intro
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
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
      treeSpreadChance: MIN_TREE_SPREAD_CHANCE,
    },
    soilDepletion: createSoilDepletionState(),
    temperature: initTemperatureState(MAP_WIDTH, MAP_HEIGHT),
    lastAutosaveTime: 0,
    plantingZoneConnections: {},
    terrainOwnership: new Array(
      Math.ceil(MAP_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) * Math.ceil(MAP_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
    navigationGrid: initNavigationGrid(MAP_WIDTH, MAP_HEIGHT),
    pathfindingQueue: [],
    tasks: {},
    buildingVersion: 0,
  };

  // Populate navigation grid with initial obstacles (trees)
  Object.values(initialWorldState.entities.entities).forEach((entity) => {
    if (entity.type === 'tree') {
      updateNavigationGridSector(
        initialWorldState,
        entity.position,
        entity.radius,
        true,
        null,
        NAVIGATION_AGENT_RADIUS,
      );
    }
  });

  return indexWorldState(initialWorldState);
}
