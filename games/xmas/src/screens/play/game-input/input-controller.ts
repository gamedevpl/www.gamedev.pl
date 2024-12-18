import { useCallback, useEffect, useState } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
} from './input-events';

const INPUT_KEYS = {
  LEFT: new Set(['ArrowLeft', 'a', 'A']),
  RIGHT: new Set(['ArrowRight', 'd', 'D']),
  UP: new Set(['ArrowUp', 'w', 'W']),
  DOWN: new Set(['ArrowDown', 's', 'S']),
  CHARGE: new Set(['Space', ' ']),
} as const;

type InputState = {
  moveInput: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  };
  isCharging: boolean;
  chargeStartTime: number | null;
};

const initialInputState: InputState = {
  moveInput: {
    left: false,
    right: false,
    up: false,
    down: false,
  },
  isCharging: false,
  chargeStartTime: null,
};

export function InputController() {
  const [inputState, setInputState] = useState<InputState>(initialInputState);

  const dispatchMovement = useCallback((moveInput: InputState['moveInput']) => {
    dispatchCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, { input: moveInput });

    if (moveInput.left && !moveInput.right) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, { direction: 'left' });
    } else if (moveInput.right && !moveInput.left) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, { direction: 'right' });
    }
  }, []);

  const handleKeyboardInput = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      // Handle charging/throwing input
      if (INPUT_KEYS.CHARGE.has(event.key)) {
        if (isKeyDown && !inputState.isCharging) {
          const timestamp = Date.now();

          setInputState((prev) => ({
            ...prev,
            isCharging: true,
            chargeStartTime: timestamp,
          }));
          dispatchCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, { timestamp });
        } else if (!isKeyDown) {
          const timestamp = Date.now();

          // Handle release based on current state
          if (inputState.isCharging) {
            setInputState((prev) => ({
              ...prev,
              isCharging: false,
              chargeStartTime: null,
            }));
            dispatchCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, { timestamp });
          }
        }
        return;
      }

      // Handle movement input
      const newMoveInput = { ...inputState.moveInput };
      let inputChanged = false;

      for (const [direction, keys] of Object.entries(INPUT_KEYS)) {
        if (direction === 'CHARGE') continue;
        if (keys.has(event.key)) {
          const dir = direction.toLowerCase() as keyof typeof newMoveInput;
          if (newMoveInput[dir] !== isKeyDown) {
            newMoveInput[dir] = isKeyDown;
            inputChanged = true;
          }
        }
      }

      if (inputChanged) {
        setInputState((prev) => ({
          ...prev,
          moveInput: newMoveInput,
        }));
        dispatchMovement(newMoveInput);
      }
    },
    [inputState.moveInput, inputState.isCharging, dispatchMovement],
  );

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

  return null;
}
