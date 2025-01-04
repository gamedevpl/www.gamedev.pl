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
  TouchEndEvent,
  InputPosition,
  LionTargetEvent,
  CancelChaseEvent,
} from './game-input/input-events';
import { Entity } from './game-world/entities-types';
import { getPlayerLion, getPrey } from './game-world/game-world-query';
// import { getLions } from './game-world-v2/game-world-query';

export function GameController({ gameStateRef }: GameControllerProps) {
  const touchStateRef = useRef<TouchState>({
    isActive: false,
    position: null,
  });

  const findPreyAtPosition = (position: InputPosition): Entity | null => {
    if (!gameStateRef.current) return null;
    const catchDistance = 80;

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

  const handleTargeting = (position: InputPosition) => {
    if (!gameStateRef.current) return;

    const prey = findPreyAtPosition(position);
    dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
      position: {
        x: position.worldX,
        y: position.worldY,
      },
      preyId: prey?.id,
    });
  };

  const handleCancelChase = () => {
    if (!gameStateRef.current) return;
    dispatchCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, {
      position: null,
    });
  };

  useCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, (event) => {
    if (!gameStateRef.current) return;

    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      lion.target.position = event.position;
      lion.target.entityId = event.preyId;
    }
  });

  useCustomEvent<CancelChaseEvent>(GameEvents.CANCEL_CHASE, () => {
    if (!gameStateRef.current) return;
    const lion = getPlayerLion(gameStateRef.current.gameWorldState);
    if (lion) {
      lion.target.position = undefined;
      lion.target.entityId = undefined;
    }
  });

  useCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, (event) => {
    if (!gameStateRef.current) return;
    if (event.primaryTouch) {
      handleTargeting(event.primaryTouch.position);
      touchStateRef.current.isActive = true;
      touchStateRef.current.position = event.primaryTouch.position;
    }
  });

  useCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, (event) => {
    if (!gameStateRef.current || !touchStateRef.current.isActive) return;
    if (event.primaryTouch) {
      handleTargeting(event.primaryTouch.position);
      touchStateRef.current.position = event.primaryTouch.position;
    }
  });

  useCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, () => {
    if (!gameStateRef.current) return;
  });

  useCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, () => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;
  });

  useCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, (event) => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;
    if (event.position && event.isPressed) {
      handleTargeting(event.position);
    } else if (!event.position) {
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
