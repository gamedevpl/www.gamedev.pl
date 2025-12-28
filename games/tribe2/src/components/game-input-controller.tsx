import React, { useEffect } from 'react';
import { DebugPanelType, GameWorldState } from '../game/world-types';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint } from '../game/ui/ui-types';
import { findPlayerEntity } from '../game/utils/world-utils';
import {
  handleUIButtonClick,
  determineHoveredAutopilotAction,
  handleAutopilotClick,
  handleGameControlKeyDown,
  handlePlayerActionKeyDown,
  handlePlayerActionKeyUp,
  handleNotificationClick,
  handleDebugPanelMouseWheel,
  handleDebugPanelMouseDown,
  handleDebugPanelMouseUp,
  handleDebugPanelMouseMove,
} from '../game/input';
import { screenToWorldCoords } from '../game/render/render-utils';

interface GameInputControllerProps {
  isActive: () => boolean;
  gameStateRef: React.MutableRefObject<GameWorldState>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  playerActionHintsRef: React.MutableRefObject<PlayerActionHint[]>;
  debugPanelTypeRef: React.MutableRefObject<DebugPanelType>;
  keysPressed: React.MutableRefObject<Set<string>>;
  returnToIntro: () => void;
}

export const GameInputController: React.FC<GameInputControllerProps> = ({
  isActive,
  gameStateRef,
  canvasRef,
  viewportCenterRef,
  playerActionHintsRef,
  keysPressed,
  returnToIntro,
}) => {
  // Handle Wheel Events (Scrolling)
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!isActive() || gameStateRef.current.gameOver || !canvasRef.current) return;

      const debugResult = handleDebugPanelMouseWheel(event, gameStateRef.current);
      gameStateRef.current = debugResult.newState;
      if (debugResult.handled) {
        return;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isActive, canvasRef, gameStateRef]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!isActive() || gameStateRef.current.gameOver || !canvasRef.current) return;
      if (!event.target || event.target !== canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Check for notification click first, as they overlay other UI
      const notificationClicked = handleNotificationClick(gameStateRef.current, mouseX, mouseY);
      if (notificationClicked) {
        return; // Event handled by notification system
      }

      // Check for general UI button click
      const clickedButton = gameStateRef.current.uiButtons.find(
        (button) =>
          mouseX >= button.rect.x &&
          mouseX <= button.rect.x + button.rect.width &&
          mouseY >= button.rect.y &&
          mouseY <= button.rect.y + button.rect.height,
      );

      if (clickedButton) {
        gameStateRef.current = handleUIButtonClick(clickedButton, event.shiftKey, gameStateRef.current, returnToIntro);
        return;
      }

      // Check for debug panel interaction
      const debugResult = handleDebugPanelMouseDown(event, gameStateRef.current);
      gameStateRef.current = debugResult.newState;
      if (debugResult.handled) {
        return;
      }

      // If not a UI element, handle as an autopilot/world click
      const worldPos = screenToWorldCoords(
        { x: mouseX, y: mouseY },
        viewportCenterRef.current,
        { width: canvasRef.current.width, height: canvasRef.current.height },
        gameStateRef.current.mapDimensions,
      );
      handleAutopilotClick(gameStateRef.current, worldPos);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!isActive() || !canvasRef.current) return;

      const debugResult = handleDebugPanelMouseUp(event, gameStateRef.current);
      gameStateRef.current = debugResult.newState;
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isActive, canvasRef, gameStateRef, viewportCenterRef, returnToIntro]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isActive() || !canvasRef.current) return;

      // Handle debug panel dragging
      const debugMoveResult = handleDebugPanelMouseMove(event, gameStateRef.current);
      gameStateRef.current = debugMoveResult.newState;
      if (debugMoveResult.handled) {
        return;
      }

      // If dragging stopped outside the panel (e.g. mouse up happened outside window), ensure we stop dragging
      if (gameStateRef.current.isDraggingDebugPanel && (event.buttons & 1) === 0) {
        const debugUpResult = handleDebugPanelMouseUp(event, gameStateRef.current);
        gameStateRef.current = debugUpResult.newState;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      gameStateRef.current.mousePosition = { x: mouseX, y: mouseY };

      let hoveredButtonId: string | undefined = undefined;

      // Check for hovered notification buttons first
      if (gameStateRef.current.notificationButtonRects) {
        for (const [id, buttonRect] of Object.entries(gameStateRef.current.notificationButtonRects.dismiss)) {
          if (
            mouseX >= buttonRect.x &&
            mouseX <= buttonRect.x + buttonRect.width &&
            mouseY >= buttonRect.y &&
            mouseY <= buttonRect.y + buttonRect.height
          ) {
            hoveredButtonId = `notification-dismiss-${id}`;
            break;
          }
        }
        if (!hoveredButtonId) {
          for (const [id, buttonRect] of Object.entries(gameStateRef.current.notificationButtonRects.view)) {
            if (
              mouseX >= buttonRect.x &&
              mouseX <= buttonRect.x + buttonRect.width &&
              mouseY >= buttonRect.y &&
              mouseY <= buttonRect.y + buttonRect.height
            ) {
              hoveredButtonId = `notification-view-${id}`;
              break;
            }
          }
        }
      }

      // If not hovering a notification button, check general UI buttons
      if (!hoveredButtonId) {
        // Iterate in reverse to find the topmost button first
        for (let i = gameStateRef.current.uiButtons.length - 1; i >= 0; i--) {
          const button = gameStateRef.current.uiButtons[i];
          if (
            mouseX >= button.rect.x &&
            mouseX <= button.rect.x + button.rect.width &&
            mouseY >= button.rect.y &&
            mouseY <= button.rect.y + button.rect.height
          ) {
            hoveredButtonId = button.id;
            break;
          }
        }
      }

      gameStateRef.current.hoveredButtonId = hoveredButtonId;

      // If hovering over any button, don't determine world actions
      if (hoveredButtonId) {
        gameStateRef.current.autopilotControls.hoveredAutopilotAction = undefined;
        return;
      }

      // Determine hovered autopilot action in the world
      const player = findPlayerEntity(gameStateRef.current);
      if (player) {
        const worldPos = screenToWorldCoords(
          { x: mouseX, y: mouseY },
          viewportCenterRef.current,
          { width: canvasRef.current.width, height: canvasRef.current.height },
          gameStateRef.current.mapDimensions,
        );
        gameStateRef.current.autopilotControls.hoveredAutopilotAction = determineHoveredAutopilotAction(
          worldPos,
          player,
          gameStateRef.current,
          event.shiftKey,
        );
      } else {
        gameStateRef.current.autopilotControls.hoveredAutopilotAction = undefined;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive, canvasRef, gameStateRef, viewportCenterRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();

      // Prevent default browser actions for certain keys that we handle
      if (
        key === ' ' ||
        key === 'p' ||
        key === 'tab' ||
        ((event.ctrlKey || event.metaKey) && (key === 's' || key === 'a'))
      ) {
        event.preventDefault();
      }

      // Handle game-wide controls first
      const controlResult = handleGameControlKeyDown(event, gameStateRef.current);
      gameStateRef.current = controlResult.newState;
      if (controlResult.handled) {
        return;
      }

      // If not a game control, handle as a player action
      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;

      keysPressed.current.add(key);
      handlePlayerActionKeyDown(key, event.shiftKey, gameStateRef.current, playerEntity, playerActionHintsRef.current);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);

      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;

      handlePlayerActionKeyUp(key, playerEntity, gameStateRef.current, keysPressed);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isActive, gameStateRef, playerActionHintsRef, keysPressed, returnToIntro]);

  return null;
};
