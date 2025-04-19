import { RefObject, useRef } from 'react';
import { dispatchCustomEvent, useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  ToggleActionEvent,
  TouchEndEvent,
  InputPosition,
  LionTargetEvent,
  CancelChaseEvent,
  LionMovementVectorEvent,
  LionActionActivateEvent,
} from './game-input/input-events';
import { Entity, LionEntity } from './game-world/entities/entities-types';
import { getPlayerLion, getPrey } from './game-world/game-world-query';
import { vectorDistance } from './game-world/utils/math-utils';
import { ATTACK_INITIATE_DISTANCE } from './game-world/game-world-consts';

export function GameController({ gameStateRef }: GameControllerProps) {
  const touchStateRef = useRef<TouchState>({
    isActive: false,
    position: null,
  });

  // Helper to find the closest prey within a given distance
  const findClosestPrey = (lion: LionEntity, maxDistance: number): Entity | null => {
    if (!gameStateRef.current) return null;
    let closestPrey: Entity | null = null;
    let minDistance = maxDistance;

    for (const prey of getPrey(gameStateRef.current.gameWorldState)) {
      const distance = vectorDistance(lion.position, prey.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestPrey = prey;
      }
    }
    return closestPrey;
  };

  const findPreyAtPosition = (position: InputPosition): Entity | null => {
    if (!gameStateRef.current) return null;
    const catchDistance = 80; // Existing catch distance for clicks

    for (const prey of getPrey(gameStateRef.current.gameWorldState)) {
      const distance = Math.sqrt(
        Math.pow(prey.position.x - position.worldX, 2) + Math.pow(prey.position.y - position.worldY, 2),
      );
      if (distance < catchDistance) {
        return prey;
      }
    }
    return null;
  };

  // --- Mouse/Touch Input Handlers ---

  const handleTargeting = (position: InputPosition) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    // If keyboard is controlling movement, mouse clicks might only target prey
    if (lion.movementVector.x !== 0 || lion.movementVector.y !== 0) {
      const prey = findPreyAtPosition(position);
      if (prey) {
        lion.target.position = undefined; // Clear position target
        lion.target.entityId = prey.id;
        lion.actions.attack.enabled = true;
        lion.actions.walk.enabled = false;
        lion.actions.ambush.enabled = false;
      }
      // Don't set position target if keyboard is moving
      return;
    }

    // Original logic: target prey if found, otherwise set position target
    const prey = findPreyAtPosition(position);
    dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
      position: prey
        ? undefined
        : {
            x: position.worldX,
            y: position.worldY,
          },
      preyId: prey?.id,
    });
  };

  const handleFollowCursor = (position: InputPosition) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    // Only follow cursor if keyboard is not moving and mouse/touch is active
    if (lion.movementVector.x === 0 && lion.movementVector.y === 0 && touchStateRef.current.isActive) {
      if (lion.actions.walk.enabled && !lion.target.entityId) {
        dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
          position: {
            x: position.worldX,
            y: position.worldY,
          },
        });
      }
    }
  };

  const handleCancelChase = () => {
    if (!gameStateRef.current) return;
    dispatchCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, {
      position: null,
    });
  };

  // --- Event Listeners ---

  // Listen for keyboard movement vector changes
  useCustomEvent<LionMovementVectorEvent>(GameEvents.SET_LION_MOVEMENT_VECTOR, (event) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      lion.movementVector = event.vector;

      // Prioritize keyboard movement: If moving via keys, clear mouse/touch target position
      if (event.vector.x !== 0 || event.vector.y !== 0) {
        lion.target.position = undefined;
        lion.actions.walk.enabled = false; // Disable walk action tied to mouse/touch
        // Keep attack/ambush enabled if they were set by SPACE
      } else {
        // If keyboard stops, allow mouse/touch walk again if input is active
        if (touchStateRef.current.isActive && touchStateRef.current.position) {
          lion.actions.walk.enabled = true;
          // Optionally re-target last mouse/touch position
          // handleFollowCursor(touchStateRef.current.position);
        } else {
          lion.actions.walk.enabled = false;
        }
      }
    }
  });

  // Listen for SPACE key activation
  useCustomEvent<LionActionActivateEvent>(GameEvents.LION_ACTION_ACTIVATE, () => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    const nearbyPrey = findClosestPrey(lion, ATTACK_INITIATE_DISTANCE);

    if (lion.actions.ambush.enabled) {
      // Currently in Ambush
      if (nearbyPrey) {
        // Ambush -> Attack Prey
        lion.target.entityId = nearbyPrey.id;
        lion.target.position = undefined;
        lion.actions.attack.enabled = true;
        lion.actions.ambush.enabled = false;
        lion.actions.walk.enabled = false;
      } else {
        // Ambush -> Walk (break ambush)
        lion.actions.walk.enabled = true; // Signal state machine to transition
        lion.actions.ambush.enabled = false;
        lion.actions.attack.enabled = false;
        lion.target = {}; // Clear target
      }
    } else {
      // Not in Ambush
      if (nearbyPrey) {
        // Idle/Moving/Chasing -> Attack Prey
        lion.target.entityId = nearbyPrey.id;
        lion.target.position = undefined;
        lion.actions.attack.enabled = true;
        lion.actions.ambush.enabled = false;
        lion.actions.walk.enabled = false;
      } else {
        // Idle/Moving/Chasing -> Ambush
        lion.actions.ambush.enabled = true;
        lion.actions.attack.enabled = false;
        lion.actions.walk.enabled = false;
        lion.target = {}; // Clear target
      }
    }
  });

  // Original mouse/touch target setting
  useCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, (event) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    // Ignore if keyboard is active (unless targeting specific prey)
    if ((lion.movementVector.x !== 0 || lion.movementVector.y !== 0) && !event.preyId) {
      return;
    }

    if (event.preyId) {
      lion.actions.attack.enabled = true;
      lion.actions.walk.enabled = false;
      lion.actions.ambush.enabled = false;
    } else if (event.position) {
      lion.actions.walk.enabled = true;
      lion.actions.attack.enabled = false;
      lion.actions.ambush.enabled = false;
    }

    lion.target.position = event.position;
    lion.target.entityId = event.preyId;
  });

  // Cancel chase (e.g., mouse up)
  useCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, () => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      // Only cancel if not moving via keyboard
      if (lion.movementVector.x === 0 && lion.movementVector.y === 0) {
        lion.target.position = undefined;
        lion.target.entityId = undefined;
        lion.actions.walk.enabled = false;
        lion.actions.attack.enabled = false;
        // Don't disable ambush here, SPACE controls it
      }
    }
  });

  // UI Button Toggles (might need adjustment or removal if SPACE is primary)
  useCustomEvent<ToggleActionEvent>(GameEvents.TOGGLE_ACTION, (event) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      // This logic might conflict with SPACE key, consider simplifying or removing
      // For now, let UI buttons override keyboard state if needed
      lion.actions[event.action].enabled = event.enabled;

      if (event.action === 'ambush' && event.enabled) {
        lion.actions.walk.enabled = lion.actions.attack.enabled = false;
        lion.target = {}; // Clear target when manually entering ambush
      }
      // If disabling an action via UI, clear targets
      if (!event.enabled) {
        handleCancelChase();
      }
    }
  });

  // --- Original Touch/Mouse Event Listeners ---

  useCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, (event) => {
    if (!gameStateRef.current) return;
    if (event.primaryTouch) {
      touchStateRef.current.isActive = true;
      touchStateRef.current.position = event.primaryTouch.position;
      handleTargeting(event.primaryTouch.position);
    }
  });

  useCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, (event) => {
    if (!gameStateRef.current || !touchStateRef.current.isActive) return;
    if (event.primaryTouch) {
      touchStateRef.current.position = event.primaryTouch.position;
      handleFollowCursor(event.primaryTouch.position);
    }
  });

  useCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, () => {
    if (!gameStateRef.current) return;
    touchStateRef.current.isActive = false;
    handleCancelChase(); // Cancel mouse/touch target on touch end
  });

  useCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, (event) => {
    if (!gameStateRef.current || !touchStateRef.current.isActive) return;
    touchStateRef.current.position = event.position;
    handleFollowCursor(event.position);
  });

  useCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, (event) => {
    if (!gameStateRef.current) return;
    touchStateRef.current.isActive = event.isPressed;
    if (event.position && event.isPressed) {
      handleTargeting(event.position);
    } else if (!event.isPressed) {
      // Mouse button released
      handleCancelChase();
    }
  });

  return null;
}

type GameControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

type TouchState = {
  isActive: boolean;
  position: InputPosition | null;
};
