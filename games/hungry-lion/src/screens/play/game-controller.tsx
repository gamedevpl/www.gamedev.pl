import { RefObject, useRef, useCallback } from 'react';
import { dispatchCustomEvent, useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  InputPosition,
  LionTargetEvent,
  CancelChaseEvent,
  LionMovementVectorEvent,
  LionActionActivateEvent,
  SetActiveActionEvent,
} from './game-input/input-events';
import { Entity, LionEntity } from './game-world/entities/entities-types';
import { getPlayerLion, getPrey } from './game-world/game-world-query';
import { vectorDistance } from './game-world/utils/math-utils';
import { ATTACK_INITIATE_DISTANCE } from './game-world/game-world-consts';
import { LionStateType } from './game-world/state-machine/states/lion';

export function GameController({ gameStateRef }: GameControllerProps) {
  const touchStateRef = useRef<TouchState>({
    isActive: false,
    position: null,
  });

  // Helper to find the closest prey within a given distance
  const findClosestPrey = useCallback(
    (lion: LionEntity, maxDistance: number): Entity | null => {
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
    },
    [gameStateRef],
  ); // Add gameStateRef as dependency

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

  /**
   * Handles the logic for initiating an attack, finding nearby prey, and setting the target.
   * @param lion The player lion entity.
   * @returns `true` if prey was found and targeted, `false` otherwise.
   */
  const handleLionAttackInitiation = useCallback(
    (lion: LionEntity): boolean => {
      const nearbyPrey = findClosestPrey(lion, ATTACK_INITIATE_DISTANCE);
      if (nearbyPrey) {
        lion.target.entityId = nearbyPrey.id;
        lion.target.position = undefined;
        lion.activeAction = 'attack';
        return true;
      } else {
        // If no prey found, still set action to attack, but clear target
        // The state machine will handle the lack of target (e.g., stay idle or move if input dictates)
        lion.target.entityId = undefined;
        lion.target.position = undefined;
        lion.activeAction = 'attack'; // Indicate intent, even without target
        return false;
      }
    },
    [findClosestPrey],
  ); // Add findClosestPrey as dependency

  // --- Mouse/Touch Input Handlers ---

  const handleTargeting = (position: InputPosition) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    const prey = findPreyAtPosition(position);

    // If keyboard is controlling movement, mouse clicks primarily target prey for attack
    if (lion.movementVector.x !== 0 || lion.movementVector.y !== 0) {
      if (prey) {
        lion.target.position = undefined; // Clear position target
        lion.target.entityId = prey.id;
        lion.activeAction = 'attack'; // Set action to attack
      }
      // If no prey clicked and keyboard is active, don't change activeAction or target
      return;
    }

    // If not moving via keyboard, mouse click sets target and action
    if (prey) {
      // Clicked on prey -> Attack
      dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
        position: undefined,
        preyId: prey.id,
      });
      // The SET_LION_TARGET listener will set activeAction = 'attack'
    } else {
      // Clicked on ground -> Walk
      dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
        position: {
          x: position.worldX,
          y: position.worldY,
        },
        preyId: undefined,
      });
      // The SET_LION_TARGET listener will set activeAction = 'walk'
    }
  };

  const handleFollowCursor = (position: InputPosition) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    // Only follow cursor if keyboard is not moving, mouse/touch is active, AND the active action is 'walk'
    if (
      lion.movementVector.x === 0 &&
      lion.movementVector.y === 0 &&
      touchStateRef.current.isActive &&
      lion.activeAction === 'walk'
    ) {
      // Only update position target if no entity is targeted
      if (!lion.target.entityId) {
        dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
          position: {
            x: position.worldX,
            y: position.worldY,
          },
        });
        // Don't change activeAction here, just update position
      }
    }
  };

  const handleCancelChase = () => {
    if (!gameStateRef.current) return;
    dispatchCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, {
      position: null, // Signal cancellation
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
      // but *don't* change activeAction set by UI or SPACE
      if (event.vector.x !== 0 || event.vector.y !== 0) {
        lion.target.position = undefined;
      } else {
        // If keyboard stops, re-enable mouse follow *if* action is walk and input is active
        if (touchStateRef.current.isActive && touchStateRef.current.position && lion.activeAction === 'walk') {
          handleFollowCursor(touchStateRef.current.position);
        }
      }
    }
  });

  // Listen for SPACE key activation
  useCustomEvent<LionActionActivateEvent>(GameEvents.LION_ACTION_ACTIVATE, () => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    const currentState = lion.stateMachine[0] as LionStateType;

    if (currentState === 'LION_AMBUSH') {
      // Currently in Ambush: Space tries to attack or breaks ambush
      const preyTargeted = handleLionAttackInitiation(lion);
      if (!preyTargeted) {
        // No prey found, break ambush -> Walk
        lion.activeAction = 'walk';
        lion.target = {}; // Clear target
      }
      // If prey was targeted, handleLionAttackInitiation already set action to 'attack'
    } else {
      // Not in Ambush (Walk, Attack, Idle): Space tries to attack or enters ambush
      const preyTargeted = handleLionAttackInitiation(lion);
      if (!preyTargeted) {
        // No prey found, enter Ambush
        lion.activeAction = 'ambush';
        lion.target = {}; // Clear target
      }
      // If prey was targeted, handleLionAttackInitiation already set action to 'attack'
    }
  });

  // Listen for mouse/touch target setting
  useCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, (event) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (!lion) return;

    // Ignore position targets if keyboard is active
    if ((lion.movementVector.x !== 0 || lion.movementVector.y !== 0) && !event.preyId && event.position) {
      return;
    }

    // Set active action based on target type
    if (event.preyId) {
      lion.activeAction = 'attack';
    } /* else if (event.position) {
      if (lion.activeAction !== 'ambush') {
        lion.activeAction = 'walk';
      }
    } else {
      // If both are undefined (e.g., cancel chase), default to walk
      lion.activeAction = 'walk';
    }*/

    lion.target.position = event.position;
    lion.target.entityId = event.preyId;
  });

  // Cancel chase (e.g., touch end)
  useCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, () => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      // Only cancel if not moving via keyboard
      if (lion.movementVector.x === 0 && lion.movementVector.y === 0) {
        lion.target.position = undefined;
        lion.target.entityId = undefined;
        // Set action back to walk when cancelling mouse/touch interaction
        lion.activeAction = 'walk';
      }
    }
  });

  // Listen for UI Button Clicks (Exclusive Actions)
  useCustomEvent<SetActiveActionEvent>(GameEvents.SET_ACTIVE_ACTION, (event) => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      // Set the intended action first
      lion.activeAction = event.action;

      // Handle specific logic for each action
      if (event.action === 'ambush') {
        lion.target = {}; // Clear target when manually entering ambush via UI
      } else if (event.action === 'walk') {
        // If walk is selected via UI, ensure no entity target remains
        lion.target.entityId = undefined;
        // If mouse/touch is currently active, start following cursor
        if (touchStateRef.current.isActive && touchStateRef.current.position) {
          handleFollowCursor(touchStateRef.current.position);
        }
      } else if (event.action === 'attack') {
        // If attack is selected via UI, attempt to initiate attack (find nearby prey)
        handleLionAttackInitiation(lion);
        // The shared function handles setting target.entityId if prey is found
        // and clears target.position.
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
    // We call handleCancelChase here specifically for touch end
    handleCancelChase();
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
      // Mouse button released - don't cancel chase, allow movement to continue
      // touchStateRef.current.isActive is already set to false above
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
