import React, { useEffect } from "react";
import { GameWorldState } from "../game/world-types";
import { Vector2D } from "../game/utils/math-types";
import { PlayerActionHint } from "../game/ui/ui-types";
import { findPlayerEntity, screenToWorldCoords } from "../game/utils/world-utils";
import {
  handleUIButtonClick,
  determineHoveredAutopilotAction,
  handleAutopilotClick,
  handleGameControlKeyDown,
  handlePlayerActionKeyDown,
  handlePlayerActionKeyUp,
} from "../game/input";

interface GameInputControllerProps {
  isActive: () => boolean;
  gameStateRef: React.MutableRefObject<GameWorldState>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  playerActionHintsRef: React.MutableRefObject<PlayerActionHint[]>;
  isDebugOnRef: React.MutableRefObject<boolean>;
  keysPressed: React.MutableRefObject<Set<string>>;
}

export const GameInputController: React.FC<GameInputControllerProps> = ({
  isActive,
  gameStateRef,
  canvasRef,
  viewportCenterRef,
  playerActionHintsRef,
  isDebugOnRef,
  keysPressed,
}) => {
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!isActive() || gameStateRef.current.gameOver || !canvasRef.current) return;
      if (!event.target || event.target !== canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Check for UI button click first
      const clickedButton = gameStateRef.current.uiButtons.find(
        (button) =>
          mouseX >= button.rect.x &&
          mouseX <= button.rect.x + button.rect.width &&
          mouseY >= button.rect.y &&
          mouseY <= button.rect.y + button.rect.height,
      );

      if (clickedButton) {
        gameStateRef.current = handleUIButtonClick(clickedButton, gameStateRef.current);
        return;
      }

      // If not a UI button, handle as an autopilot/world click
      const worldPos = screenToWorldCoords(
        { x: mouseX, y: mouseY },
        viewportCenterRef.current,
        { width: canvasRef.current.width, height: canvasRef.current.height },
        gameStateRef.current.mapDimensions,
      );
      handleAutopilotClick(gameStateRef.current, worldPos);
    };

    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isActive, canvasRef, gameStateRef, viewportCenterRef]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isActive() || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      gameStateRef.current.mousePosition = { x: mouseX, y: mouseY };

      // Determine hovered button
      let hoveredButtonId: string | undefined = undefined;
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
      gameStateRef.current.hoveredButtonId = hoveredButtonId;

      // If hovering over a button, don't determine world actions
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
        );
      } else {
        gameStateRef.current.autopilotControls.hoveredAutopilotAction = undefined;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isActive, canvasRef, gameStateRef, viewportCenterRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;

      const key = event.key.toLowerCase();

      // Prevent default browser actions for certain keys that we handle
      if (key === " " || key === "p" || key === "tab") {
        event.preventDefault();
      }

      if (key === "escape") {
        // Cancel active autopilot command
        gameStateRef.current.autopilotControls.activeAutopilotAction = undefined;
        return;
      }

      // Handle game-wide controls first
      const controlResult = handleGameControlKeyDown(key, gameStateRef.current, isDebugOnRef);
      gameStateRef.current = controlResult.newState;
      if (controlResult.handled) {
        return;
      }

      // If not a game control, handle as a player action
      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;

      keysPressed.current.add(key);
      handlePlayerActionKeyDown(key, gameStateRef.current, playerEntity, playerActionHintsRef);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isActive() || gameStateRef.current.gameOver) return;
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);

      const playerEntity = findPlayerEntity(gameStateRef.current);
      if (!playerEntity) return;

      handlePlayerActionKeyUp(key, playerEntity, gameStateRef.current, keysPressed);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isActive, gameStateRef, playerActionHintsRef, isDebugOnRef, keysPressed]);

  return null;
};
