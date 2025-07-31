import { createEntities, createBerryBush, createHuman, createPrey, createPredator } from './entities/entities-update';
import { GameWorldState } from './world-types';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  INITIAL_BERRY_BUSH_COUNT,
  INITIAL_MASTER_VOLUME,
  UI_BUTTON_WIDTH,
  INTRO_SCREEN_INITIAL_HUMANS,
  UI_BUTTON_TEXT_COLOR,
  INITIAL_PREY_COUNT,
  INITIAL_PREDATOR_COUNT,
} from './world-consts';
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
  const player = createHuman(entities, { x: centerX, y: centerY }, initialTime, 'male', true);

  // Spawn partner character (female) near the player
  createHuman(
    entities,
    { x: centerX + 50, y: centerY },
    initialTime,
    'female',
    false, // isPlayer = false
  );

  // Spawn initial prey animals in specific zones away from center
  const preySpawnZones = [
    { centerX: MAP_WIDTH * 0.2, centerY: MAP_HEIGHT * 0.2, radius: 200 },
    { centerX: MAP_WIDTH * 0.8, centerY: MAP_HEIGHT * 0.2, radius: 200 },
    { centerX: MAP_WIDTH * 0.2, centerY: MAP_HEIGHT * 0.8, radius: 200 },
    { centerX: MAP_WIDTH * 0.8, centerY: MAP_HEIGHT * 0.8, radius: 200 },
  ];
  
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const zone = preySpawnZones[i % preySpawnZones.length];
    const angle = (i / INITIAL_PREY_COUNT) * 2 * Math.PI;
    const distance = zone.radius * (0.3 + 0.4 * (i % 3) / 2); // Varying distances within zone
    
    const spawnPosition = {
      x: zone.centerX + Math.cos(angle) * distance,
      y: zone.centerY + Math.sin(angle) * distance,
    };
    
    // Ensure spawn position is within map bounds
    spawnPosition.x = Math.max(50, Math.min(MAP_WIDTH - 50, spawnPosition.x));
    spawnPosition.y = Math.max(50, Math.min(MAP_HEIGHT - 50, spawnPosition.y));
    
    const gender = i % 2 === 0 ? 'male' : 'female'; // Alternating genders for balance
    const geneCode = generateRandomPreyGeneCode();
    createPrey(entities, spawnPosition, gender, undefined, undefined, geneCode);
  }

  // Spawn initial predators in corners away from center (minimum 400 pixels from center)
  const predatorSpawnZones = [
    { centerX: MAP_WIDTH * 0.1, centerY: MAP_HEIGHT * 0.1 },
    { centerX: MAP_WIDTH * 0.9, centerY: MAP_HEIGHT * 0.9 },
  ];
  
  for (let i = 0; i < INITIAL_PREDATOR_COUNT; i++) {
    const zone = predatorSpawnZones[i % predatorSpawnZones.length];
    const offsetDistance = 100 + (i * 50); // Spread them out within the zone
    const angle = (i / INITIAL_PREDATOR_COUNT) * Math.PI; // Half circle distribution
    
    const spawnPosition = {
      x: zone.centerX + Math.cos(angle) * offsetDistance,
      y: zone.centerY + Math.sin(angle) * offsetDistance,
    };
    
    // Ensure spawn position is within map bounds and far from center
    spawnPosition.x = Math.max(50, Math.min(MAP_WIDTH - 50, spawnPosition.x));
    spawnPosition.y = Math.max(50, Math.min(MAP_HEIGHT - 50, spawnPosition.y));
    
    // Double-check distance from center
    const distanceFromCenter = Math.sqrt(
      Math.pow(spawnPosition.x - centerX, 2) + Math.pow(spawnPosition.y - centerY, 2)
    );
    
    if (distanceFromCenter < 400) {
      // Push further away from center if too close
      const pushDirection = {
        x: (spawnPosition.x - centerX) / distanceFromCenter,
        y: (spawnPosition.y - centerY) / distanceFromCenter,
      };
      spawnPosition.x = centerX + pushDirection.x * 400;
      spawnPosition.y = centerY + pushDirection.y * 400;
    }
    
    const gender = i % 2 === 0 ? 'male' : 'female'; // Alternating genders for balance
    const geneCode = generateRandomPredatorGeneCode();
    createPredator(entities, spawnPosition, gender, undefined, undefined, geneCode);
  }

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
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: false,
    uiButtons,
    tutorial,
    tutorialState,
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

  // Spawn initial prey animals in the intro world
  for (let i = 0; i < Math.floor(INITIAL_PREY_COUNT * 0.6); i++) { // Fewer animals in intro
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    const gender = i % 2 === 0 ? 'male' : 'female';
    const geneCode = generateRandomPreyGeneCode();
    createPrey(entities, randomPosition, gender, undefined, undefined, geneCode);
  }

  // Spawn initial predators in the intro world
  for (let i = 0; i < Math.floor(INITIAL_PREDATOR_COUNT * 0.5); i++) { // Even fewer predators in intro
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    const gender = i % 2 === 0 ? 'male' : 'female';
    const geneCode = generateRandomPredatorGeneCode();
    createPredator(entities, randomPosition, gender, undefined, undefined, geneCode);
  }

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
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true, // Muted by default for the intro
    uiButtons: [], // No UI buttons in the intro
    tutorial,
    tutorialState,
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [],
  };

  return indexWorldState(initialWorldState);
}
