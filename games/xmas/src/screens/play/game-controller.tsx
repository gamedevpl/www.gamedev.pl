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
  MousePosition,
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

// Configuration for mouse movement in world coordinates
const MOUSE_CONFIG = {
  // Minimum distance in world units to trigger movement
  MOVEMENT_DEADZONE: 10,
  // Maximum movement speed
  MAX_SPEED: 1.0,
  // How quickly movement responds to mouse position
  MOVEMENT_SMOOTHING: 0.8,
  // Maximum distance to consider for movement calculation
  MAX_DISTANCE: 200,
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
  const calculateMouseMovement = useCallback((position: MousePosition, playerSanta: GameWorldState['playerSanta']) => {
    const { worldX, worldY } = position;
    const { x: playerX, y: playerY } = playerSanta;

    // Calculate vector to target
    const { dx, dy, distance } = calculateVectorToTarget(playerX, playerY, worldX, worldY);

    // If within deadzone, no movement
    if (distance < MOUSE_CONFIG.MOVEMENT_DEADZONE) {
      return {
        left: false,
        right: false,
        up: false,
        down: false,
      };
    }

    // Calculate normalized direction vector
    const normalizedDistance = Math.min(distance, MOUSE_CONFIG.MAX_DISTANCE) / MOUSE_CONFIG.MAX_DISTANCE;
    const { nx, ny } = normalizeVector(dx, dy, normalizedDistance * MOUSE_CONFIG.MAX_SPEED);

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
  }, []);

  // Handle mouse movement
  useCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, (event) => {
    if (!gameStateRef.current) return;

    mouseStateRef.current.position = event.position;

    // Only calculate movement if any mouse button is pressed
    if (mouseStateRef.current.leftButton || mouseStateRef.current.rightButton) {
      const moveInput = calculateMouseMovement(event.position, gameStateRef.current.gameWorldState.playerSanta);
      moveSanta(gameStateRef.current.gameWorldState.playerSanta, moveInput);
    }
  });

  // Handle mouse buttons
  useCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, (event) => {
    if (!gameStateRef.current) return;

    const prevState = mouseStateRef.current;
    const newState = {
      ...prevState,
      position: event.position,
      [event.button + 'Button']: event.isPressed,
    };
    mouseStateRef.current = newState;

    // Handle charging (both buttons pressed)
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
      const moveInput = calculateMouseMovement(newState.position, gameStateRef.current.gameWorldState.playerSanta);
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
