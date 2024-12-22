import { RefObject, useCallback, useRef } from 'react';
import { dispatchCustomEvent, useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import { addFireballFromSanta, moveSanta, setSantaDirection } from './game-world/game-world-manipulate';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  InputPosition,
  MousePosition,
  TouchRole,
} from './game-input/input-events';

type GameControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

type MouseState = {
  position: MousePosition | null;
  leftButton: boolean;
  rightButton: boolean;
};

type TouchState = {
  isActive: boolean;
  position: InputPosition | null;
  isCharging: boolean;
  chargeStartTime: number | null;
};

// Configuration for input movement in world coordinates
const INPUT_CONFIG = {
  // Minimum distance in world units to trigger movement
  MOVEMENT_DEADZONE: 8,
  // Maximum movement speed
  MAX_SPEED: 1.0,
  // How quickly movement responds to input position
  MOVEMENT_SMOOTHING: 0.8,
  // Maximum distance to consider for movement calculation
  MAX_DISTANCE: 200,
  // Touch-specific adjustments
  TOUCH: {
    // Slightly larger deadzone for touch to prevent accidental movements
    MOVEMENT_DEADZONE: 12,
    // Adjusted smoothing for touch input
    MOVEMENT_SMOOTHING: 0.7,
  },
};

function calculateVectorToTarget(
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
): { dx: number; dy: number; distance: number } {
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return { dx, dy, distance };
}

function normalizeVector(dx: number, dy: number, scale: number = 1.0): { nx: number; ny: number } {
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return { nx: 0, ny: 0 };
  return {
    nx: (dx / length) * scale,
    ny: (dy / length) * scale,
  };
}

export function GameController({ gameStateRef }: GameControllerProps) {
  const mouseStateRef = useRef<MouseState>({
    position: null,
    leftButton: false,
    rightButton: false,
  });

  const touchStateRef = useRef<TouchState>({
    isActive: false,
    position: null,
    isCharging: false,
    chargeStartTime: null,
  });

  // Handle keyboard movement events
  useCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, (event) => {
    if (!gameStateRef.current) return;
    moveSanta(gameStateRef.current.gameWorldState.playerSanta, event.input);
  });

  useCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, (event) => {
    if (!gameStateRef.current) return;
    setSantaDirection(gameStateRef.current.gameWorldState.playerSanta, event.direction);
  });

  // Calculate movement based on world coordinates
  const calculateMovement = useCallback(
    (position: InputPosition, playerSanta: GameWorldState['playerSanta'], isTouch: boolean = false) => {
      const { worldX, worldY } = position;
      const { x: playerX, y: playerY } = playerSanta;

      // Calculate vector to target
      const { dx, dy, distance } = calculateVectorToTarget(playerX, playerY, worldX, worldY);

      // Use touch-specific or default deadzone
      const deadzone = isTouch ? INPUT_CONFIG.TOUCH.MOVEMENT_DEADZONE : INPUT_CONFIG.MOVEMENT_DEADZONE;

      // If within deadzone, no movement
      if (distance < deadzone) {
        return {
          left: false,
          right: false,
          up: false,
          down: false,
        };
      }

      // Calculate normalized direction vector
      const normalizedDistance = Math.min(distance, INPUT_CONFIG.MAX_DISTANCE) / INPUT_CONFIG.MAX_DISTANCE;
      const { nx, ny } = normalizeVector(dx, dy, normalizedDistance * INPUT_CONFIG.MAX_SPEED);

      // Set movement direction based on normalized vector
      const movement = {
        left: nx < -0.1,
        right: nx > 0.1,
        up: ny < -0.1,
        down: ny > 0.1,
      };

      // Set Santa's facing direction based on horizontal movement
      if (Math.abs(nx) > 0.1) {
        dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, {
          direction: nx < 0 ? 'left' : 'right',
        });
      }

      return movement;
    },
    [],
  );

  // Handle touch events with multi-touch support
  useCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, (event) => {
    if (!gameStateRef.current) return;

    // Handle movement touch (primary)
    if (event.primaryTouch.role === TouchRole.MOVEMENT) {
      touchStateRef.current.isActive = true;
      touchStateRef.current.position = event.primaryTouch.position;

      const moveInput = calculateMovement(
        event.primaryTouch.position,
        gameStateRef.current.gameWorldState.playerSanta,
        true,
      );
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, moveInput);
    }

    // Handle charging touch
    if (event.chargingTouch && event.chargingTouch.role === TouchRole.CHARGING) {
      touchStateRef.current.isCharging = true;
      touchStateRef.current.chargeStartTime = event.timestamp;
      
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, {
        charging: true,
        chargeStartTime: event.timestamp,
      });
    }
  });

  useCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, (event) => {
    if (!gameStateRef.current || !touchStateRef.current.isActive) return;

    // Update movement if primary touch moved
    if (event.primaryTouch.role === TouchRole.MOVEMENT) {
      touchStateRef.current.position = event.primaryTouch.position;

      const moveInput = calculateMovement(
        event.primaryTouch.position,
        gameStateRef.current.gameWorldState.playerSanta,
        true,
      );
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, moveInput);
    }
  });

  useCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, (event) => {
    if (!gameStateRef.current) return;

    // Handle charging touch release
    if (event.wasCharging && touchStateRef.current.isCharging) {
      const chargeStartTime = touchStateRef.current.chargeStartTime;
      if (chargeStartTime !== null) {
        const chargeDuration = event.timestamp - chargeStartTime;
        addFireballFromSanta(gameStateRef.current.gameWorldState, gameStateRef.current.gameWorldState.playerSanta, chargeDuration);
      }

      touchStateRef.current.isCharging = false;
      touchStateRef.current.chargeStartTime = null;

      moveSanta(gameStateRef.current.gameWorldState.playerSanta, {
        charging: false,
        chargeStartTime: null,
      });
    }

    // Reset movement when all touches are gone
    if (event.touches.length === 0) {
      touchStateRef.current = {
        isActive: false,
        position: null,
        isCharging: false,
        chargeStartTime: null,
      };

      // Reset movement when touch ends
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, {
        left: false,
        right: false,
        up: false,
        down: false,
      });
    }
  });

  // Handle mouse movement
  useCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, (event) => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;

    mouseStateRef.current.position = event.position;

    // Only calculate movement if any mouse button is pressed
    if (mouseStateRef.current.leftButton || mouseStateRef.current.rightButton) {
      const moveInput = calculateMovement(event.position, gameStateRef.current.gameWorldState.playerSanta);
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, moveInput);
    }
  });

  // Handle mouse buttons
  useCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, (event) => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;

    const prevState = mouseStateRef.current;
    const newState = {
      ...prevState,
      position: event.position,
      [event.button + 'Button']: event.isPressed,
    };
    mouseStateRef.current = newState;

    // Handle charging (right button)
    const wasCharging = prevState.rightButton;
    const isCharging = newState.rightButton;

    if (isCharging && !wasCharging) {
      // Start charging
      dispatchCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, {
        timestamp: event.timestamp,
      });
    } else if (!isCharging && wasCharging) {
      // Stop charging
      dispatchCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, {
        timestamp: event.timestamp,
      });
    }

    // Handle movement
    if (newState.position && (newState.leftButton || newState.rightButton)) {
      const moveInput = calculateMovement(newState.position, gameStateRef.current.gameWorldState.playerSanta);
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, moveInput);
    } else if (!newState.leftButton && !newState.rightButton) {
      // Reset movement when no buttons are pressed
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, {
        left: false,
        right: false,
        up: false,
        down: false,
      });
    }
  });

  // Handle keyboard charging events
  useCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;

    moveSanta(playerSanta, {
      charging: true,
      chargeStartTime: event.timestamp,
    });
  });

  useCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;
    const { chargeStartTime } = playerSanta.input;

    if (chargeStartTime !== null) {
      moveSanta(playerSanta, {
        charging: false,
        chargeStartTime: null,
      });

      addFireballFromSanta(gameStateRef.current.gameWorldState, playerSanta, event.timestamp - chargeStartTime);
    }
  });

  return null;
}