import { createEntities, createBerryBush, createHuman } from './entities/entities-update';
import { GameWorldState } from './world-types';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  INITIAL_BERRY_BUSH_COUNT,
  INITIAL_MASTER_VOLUME,
  UI_BUTTON_WIDTH,
  INTRO_SCREEN_INITIAL_HUMANS,
  UI_BUTTON_TEXT_COLOR,
} from './world-consts';
import { indexWorldState } from './world-index/world-state-index';
import { createTutorial, createTutorialState } from './tutorial';
import { ClickableUIButton, UIButtonActionType } from './ui/ui-types';

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
        callToAttack: false,
        followMe: false,
        feedChildren: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: false,
    uiButtons,
    tutorial,
    tutorialState,
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
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
        callToAttack: false,
        followMe: false,
        feedChildren: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true, // Muted by default for the intro
    uiButtons: [], // No UI buttons in the intro
    tutorial,
    tutorialState,
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
  };

  return indexWorldState(initialWorldState);
}
