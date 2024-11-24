import { useCallback, useEffect, useState } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
} from './input-events';

// Type helper for key checking
type InputKeyType = (typeof INPUT_KEYS)[keyof typeof INPUT_KEYS][number];

/**
 * Maps keyboard keys to input actions with proper type assertions
 */
const INPUT_KEYS = {
  LEFT: ['ArrowLeft', 'a', 'A'],
  RIGHT: ['ArrowRight', 'd', 'D'],
  UP: ['ArrowUp', 'w', 'W'],
  DOWN: ['ArrowDown', 's', 'S'],
  CHARGE: ['Space', ' '], // Space key for charging
};

export type InputState = {
  // Movement state
  moveInput: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  };
  // Charging state
  isCharging: boolean;
  chargeStartTime: number | null;
};

/**
 * Type guard to check if a key is a valid input key
 */
function isValidInputKey(key: string): key is InputKeyType {
  return (
    INPUT_KEYS.LEFT.includes(key) ||
    INPUT_KEYS.RIGHT.includes(key) ||
    INPUT_KEYS.UP.includes(key) ||
    INPUT_KEYS.DOWN.includes(key) ||
    INPUT_KEYS.CHARGE.includes(key)
  );
}

export function InputController() {
  const [inputState, setInputState] = useState<InputState>({
    moveInput: {
      left: false,
      right: false,
      up: false,
      down: false,
    },
    isCharging: false,
    chargeStartTime: null,
  });

  // Dispatch movement event when input changes
  const dispatchMovement = useCallback((moveInput: InputState['moveInput']) => {
    dispatchCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, {
      input: moveInput,
    });

    // Update Santa direction based on horizontal movement
    if (moveInput.left && !moveInput.right) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, {
        direction: 'left',
      });
    } else if (moveInput.right && !moveInput.left) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, {
        direction: 'right',
      });
    }
  }, []);

  // Handle keyboard input with type safety
  const handleKeyboardInput = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      if (!isValidInputKey(event.key)) return;

      // Handle charging input (Space key)
      if (INPUT_KEYS.CHARGE.includes(event.key)) {
        if (isKeyDown && !inputState.isCharging) {
          // Start charging
          const timestamp = Date.now();
          setInputState((prev) => ({
            ...prev,
            isCharging: true,
            chargeStartTime: timestamp,
          }));
          dispatchCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, {
            timestamp,
          });
        } else if (!isKeyDown && inputState.isCharging) {
          // Stop charging
          const timestamp = Date.now();
          setInputState((prev) => ({
            ...prev,
            isCharging: false,
            chargeStartTime: null,
          }));
          dispatchCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, {
            timestamp,
          });
        }
        return;
      }

      // Handle movement input
      const newMoveInput = { ...inputState.moveInput };
      let inputChanged = false;

      // Check each input direction with proper type assertions
      if (INPUT_KEYS.LEFT.includes(event.key) && newMoveInput.left !== isKeyDown) {
        newMoveInput.left = isKeyDown;
        inputChanged = true;
      }
      if (INPUT_KEYS.RIGHT.includes(event.key) && newMoveInput.right !== isKeyDown) {
        newMoveInput.right = isKeyDown;
        inputChanged = true;
      }
      if (INPUT_KEYS.UP.includes(event.key) && newMoveInput.up !== isKeyDown) {
        newMoveInput.up = isKeyDown;
        inputChanged = true;
      }
      if (INPUT_KEYS.DOWN.includes(event.key) && newMoveInput.down !== isKeyDown) {
        newMoveInput.down = isKeyDown;
        inputChanged = true;
      }

      if (inputChanged) {
        setInputState((prev) => ({
          ...prev,
          moveInput: newMoveInput,
        }));
        dispatchMovement(newMoveInput);
      }
    },
    [inputState.moveInput, inputState.isCharging, inputState.chargeStartTime, dispatchMovement],
  );

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleKeyboardInput(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKeyboardInput(event, false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyboardInput]);

  // Component doesn't render anything visible
  return null;
}
