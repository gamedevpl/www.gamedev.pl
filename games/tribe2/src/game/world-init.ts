import { createEntities, createBerryBush, createHuman, createPrey, createPredator } from './entities/entities-update';
import { DebugPanelType, GameWorldState } from './world-types';
import { MAP_WIDTH, MAP_HEIGHT, INTRO_SCREEN_INITIAL_HUMANS } from './game-consts.ts';
import { INITIAL_BERRY_BUSH_COUNT, MIN_BERRY_BUSH_SPREAD_CHANCE } from './berry-bush-consts.ts';
import { INITIAL_MASTER_VOLUME } from './sound-consts.ts';
import { UI_BUTTON_WIDTH, UI_BUTTON_TEXT_COLOR } from './ui/ui-consts.ts';
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

  // Define the center of the map for character spawning
  const centerX = MAP_WIDTH / 2;
  const centerY = MAP_HEIGHT / 2;

  // Spawn player character (male) at center
  const player = createHuman(entities, { x: centerX - 25, y: centerY }, initialTime, 'male', true);

  // Spawn partner character (female) near the player
  createHuman(
    entities,
    { x: centerX + 25, y: centerY },
    initialTime,
    'female',
    false, // isPlayer = false
  );

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const radiusX = MAP_WIDTH / 2;
    const radiusY = MAP_HEIGHT / 2;
    const spawnPosition = {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };

    // Spawn second tribe
    createHuman(
      entities,
      { x: spawnPosition.x, y: spawnPosition.y },
      initialTime,
      'male',
      false, // isPlayer = false
    );

    createHuman(
      entities,
      { x: spawnPosition.x + 50, y: spawnPosition.y },
      initialTime,
      'female',
      false, // isPlayer = false
    );
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
    viewportCenter: { ...player.position },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
        build: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    buildMenuOpen: false,
    roleManagerOpen: false,
    selectedBuildingType: null,
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
    },
    autosaveIntervalSeconds: 5,
    lastAutosaveTime: Date.now(),
  };

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
    viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
        build: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    buildMenuOpen: false,
    roleManagerOpen: false,
    selectedBuildingType: null,
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
    },
    lastAutosaveTime: 0,
  };

  return indexWorldState(initialWorldState);
}
