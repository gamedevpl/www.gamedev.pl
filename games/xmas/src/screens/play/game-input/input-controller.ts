import React, { useCallback, useEffect, useState } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import { CreateFireballEvent, GameEvents, UpdateFireballEvent } from './input-events';

const FIREBALL_START_DELAY = 100;
const MIN_FIREBALL_RADIUS = 50;
const MAX_FIREBALL_RADIUS = 300;
const FIREBALL_GROWTH_RATE = 100; // pixels per second

export type InputState = {
  isInteracting: boolean;
  interactionStartTime: number | null;
  currentPosition: { x: number; y: number } | null;
  currentFireballId: string | null;
};

export type InputControllerProps = {
  canvasRef: React.RefObject<HTMLCanvasElement>;
};

/**
 * Generates a unique ID for a fireball
 */
function generateFireballId(): string {
  return `fireball_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const InputController: React.FC<InputControllerProps> = ({ canvasRef }) => {
  const [, setInputState] = useState<InputState>({
    isInteracting: false,
    interactionStartTime: null,
    currentPosition: null,
    currentFireballId: null,
  });

  const handleInteractionStart = useCallback((x: number, y: number) => {
    setInputState({
      isInteracting: true,
      interactionStartTime: Date.now(),
      currentPosition: { x, y },
      currentFireballId: null, // Will be set when fireball is created
    });
  }, []);

  const handleInteractionMove = useCallback((x: number, y: number) => {
    setInputState((prev) => {
      if (!prev.isInteracting) return prev;

      const currentTime = Date.now();
      const holdDuration = prev.interactionStartTime ? currentTime - prev.interactionStartTime : 0;

      // Only process move if we're past the start delay
      if (holdDuration >= FIREBALL_START_DELAY) {
        const growthDuration = holdDuration - FIREBALL_START_DELAY;
        const radius = Math.min(
          MAX_FIREBALL_RADIUS,
          MIN_FIREBALL_RADIUS + (growthDuration / 1000) * FIREBALL_GROWTH_RATE,
        );

        // If we don't have a fireball ID yet, this is the first update after delay
        if (!prev.currentFireballId) {
          const newFireballId = generateFireballId();
          // Dispatch create event
          dispatchCustomEvent<CreateFireballEvent>(GameEvents.CREATE_FIREBALL, {
            id: newFireballId,
            x,
            y,
            radius,
            vx: 0,
            vy: 0,
          });

          return {
            ...prev,
            currentPosition: { x, y },
            currentFireballId: newFireballId,
          };
        } else if (prev.currentPosition) {
          // Update existing fireball
          dispatchCustomEvent<UpdateFireballEvent>(GameEvents.UPDATE_FIREBALL, {
            id: prev.currentFireballId,
            x: prev.currentPosition.x,
            y: prev.currentPosition.y,
            radius,
            vx: 0,
            vy: 0,
          });

          return {
            ...prev,
          };
        }
      }

      return {
        ...prev,
        currentPosition: { x, y },
      };
    });
  }, []);

  const handleInteractionEnd = useCallback((x: number, y: number) => {
    setInputState((prev) => {
      if (prev.currentFireballId && prev.currentPosition) {
        const currentTime = Date.now();
        const holdDuration = prev.interactionStartTime ? currentTime - prev.interactionStartTime : 0;

        // Only process move if we're past the start delay
        const growthDuration = holdDuration - FIREBALL_START_DELAY;
        const radius = Math.min(
          MAX_FIREBALL_RADIUS,
          MIN_FIREBALL_RADIUS + (growthDuration / 1000) * FIREBALL_GROWTH_RATE,
        );

        // Constants for velocity calculation and smoothing
        const VELOCITY_SMOOTHING = 0.5; // Lower values make velocity changes more smooth
        const MIN_POSITION_DELTA = 10; // Minimum position change to calculate velocity

        // Calculate position deltas
        let dx = x - prev.currentPosition.x;
        let dy = y - prev.currentPosition.y;

        // Normalize
        const distance = Math.sqrt(dx * dx + dy * dy);
        dx /= distance;
        dy /= distance;

        // Only update velocity if position change is significant
        const shouldMove = Math.abs(distance) > MIN_POSITION_DELTA;
        // Calculate new velocities with smoothing
        const vx = shouldMove ? dx * VELOCITY_SMOOTHING : 0;
        const vy = shouldMove ? dy * VELOCITY_SMOOTHING : 0;

        // Update existing fireball
        dispatchCustomEvent<UpdateFireballEvent>(GameEvents.UPDATE_FIREBALL, {
          id: prev.currentFireballId,
          x: prev.currentPosition.x,
          y: prev.currentPosition.y,
          radius,
          vx,
          vy,
        });
      }

      return {
        isInteracting: false,
        interactionStartTime: null,
        currentPosition: null,
        currentFireballId: null,
      };
    });
  }, []);

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      handleInteractionStart(event.clientX, event.clientY);
    },
    [handleInteractionStart],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      handleInteractionMove(event.clientX, event.clientY);
    },
    [handleInteractionMove],
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      handleInteractionEnd(event.clientX, event.clientY);
    },
    [handleInteractionEnd],
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      handleInteractionStart(touch.clientX, touch.clientY);
    },
    [handleInteractionStart],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      handleInteractionMove(touch.clientX, touch.clientY);
    },
    [handleInteractionMove],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      handleInteractionEnd(touch.clientX, touch.clientY);
    },
    [handleInteractionEnd],
  );

  // Set up event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    // Cleanup function
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [canvasRef, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Component doesn't render anything visible
  return null;
};