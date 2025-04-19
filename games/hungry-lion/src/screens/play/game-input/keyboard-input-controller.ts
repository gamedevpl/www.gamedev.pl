import { useEffect, useRef, useCallback } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  LionMovementVectorEvent,
  LionActionActivateEvent,
  KeyDownEvent,
  KeyUpEvent,
} from './input-events';
import { Vector2D } from '../game-world/utils/math-types';

const MOVEMENT_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const ACTION_KEY = ' ';

export function KeyboardInputController() {
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const movementVectorRef = useRef<Vector2D>({ x: 0, y: 0 });

  const calculateMovementVector = useCallback(() => {
    let dx = 0;
    let dy = 0;
    const keys = pressedKeysRef.current;

    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    // Normalize the vector if moving diagonally
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    const newVector = { x: dx, y: dy };

    // Only dispatch if the vector has changed
    if (movementVectorRef.current.x !== newVector.x || movementVectorRef.current.y !== newVector.y) {
      movementVectorRef.current = newVector;
      dispatchCustomEvent<LionMovementVectorEvent>(GameEvents.SET_LION_MOVEMENT_VECTOR, {
        vector: newVector,
      });
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (pressedKeysRef.current.has(key)) return; // Ignore repeat events

      // Movement Keys
      if (MOVEMENT_KEYS.includes(key)) {
        pressedKeysRef.current.add(key);
        calculateMovementVector();
        dispatchCustomEvent<KeyDownEvent>(GameEvents.KEY_DOWN, { key });
      }

      // Action Key (Space)
      if (key === ACTION_KEY) {
        pressedKeysRef.current.add(key);
        dispatchCustomEvent<LionActionActivateEvent>(GameEvents.LION_ACTION_ACTIVATE, {
          timestamp: Date.now(),
        });
        dispatchCustomEvent<KeyDownEvent>(GameEvents.KEY_DOWN, { key });
      }
    },
    [calculateMovementVector],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      // Movement Keys
      if (MOVEMENT_KEYS.includes(key)) {
        pressedKeysRef.current.delete(key);
        calculateMovementVector();
        dispatchCustomEvent<KeyUpEvent>(GameEvents.KEY_UP, { key });
      }

      // Action Key (Space)
      if (key === ACTION_KEY) {
        pressedKeysRef.current.delete(key);
        dispatchCustomEvent<KeyUpEvent>(GameEvents.KEY_UP, { key });
      }
    },
    [calculateMovementVector],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Initial calculation in case keys are held down on load (unlikely but safe)
    calculateMovementVector();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);

      // Dispatch zero vector on unmount to stop movement
      if (movementVectorRef.current.x !== 0 || movementVectorRef.current.y !== 0) {
        movementVectorRef.current = { x: 0, y: 0 };
        dispatchCustomEvent<LionMovementVectorEvent>(GameEvents.SET_LION_MOVEMENT_VECTOR, {
          vector: { x: 0, y: 0 },
        });
      }
    };
  }, [handleKeyDown, handleKeyUp, calculateMovementVector]);

  // This component doesn't render anything itself
  return null;
}
