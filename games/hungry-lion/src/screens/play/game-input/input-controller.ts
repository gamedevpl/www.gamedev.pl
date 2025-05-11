import { useCallback, useEffect, useState, RefObject } from "react";
import { dispatchCustomEvent } from "../../../utils/custom-events";
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  InputPosition,
  TouchPoint,
  TouchRole,
  SetActiveActionEvent,
} from "./input-events";
import { RenderState, ViewportState } from "../game-render/render-state";
import { GameWorldState } from "../game-world/game-world-types";
import {
  getActionBarLayout,
  ActionButtonLayout,
} from "../game-render/action-bar-renderer"; // Import layout info

type InputControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
  canvasRef: RefObject<HTMLCanvasElement>;
};

type InputState = {
  isPressed: boolean;
  activeTouches: Map<number, TouchPoint>;
};

const initialInputState: InputState = {
  isPressed: false,
  activeTouches: new Map(),
};

// Helper function to check if a point is within a button's bounds
function isPointInButton(
  x: number,
  y: number,
  button: ActionButtonLayout
): boolean {
  return (
    x >= button.x &&
    x <= button.x + button.width &&
    y >= button.y &&
    y <= button.y + button.height
  );
}

export function InputController({
  gameStateRef,
  canvasRef,
}: InputControllerProps) {
  const [inputState, setInputState] = useState<InputState>(initialInputState);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!gameStateRef.current || !canvasRef.current) return;

      const position = calculateInputPosition(
        event.clientX,
        event.clientY,
        gameStateRef.current.renderState.viewport,
        canvasRef.current
      );

      dispatchCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, {
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef, canvasRef]
  );

  const handleMouseButtons = useCallback(
    (event: MouseEvent, isDown: boolean) => {
      event.preventDefault();

      if (event.button !== 0 || !gameStateRef.current || !canvasRef.current)
        return;

      const canvas = canvasRef.current;
      const screenX = event.clientX;
      const screenY = event.clientY;

      // --- Action Bar Hit Test (Only on Mouse Down) ---
      if (isDown) {
        const actionBarLayout = getActionBarLayout(canvas.width, canvas.height);
        for (const buttonLayout of actionBarLayout.buttons) {
          if (isPointInButton(screenX, screenY, buttonLayout)) {
            dispatchCustomEvent<SetActiveActionEvent>(
              GameEvents.SET_ACTIVE_ACTION,
              { action: buttonLayout.action }
            );
            return; // Prevent default world click if UI button is hit
          }
        }
      }
      // --- End Action Bar Hit Test ---

      const position = calculateInputPosition(
        screenX,
        screenY,
        gameStateRef.current.renderState.viewport,
        canvas
      );

      setInputState((prev) => ({ ...prev, isPressed: isDown }));

      dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
        button: "left",
        isPressed: isDown,
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef, canvasRef]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const touch = event.touches[0];
      if (!touch) return;

      const screenX = touch.clientX;
      const screenY = touch.clientY;

      // --- Action Bar Hit Test ---
      const actionBarLayout = getActionBarLayout(canvas.width, canvas.height);
      for (const buttonLayout of actionBarLayout.buttons) {
        if (isPointInButton(screenX, screenY, buttonLayout)) {
          dispatchCustomEvent<SetActiveActionEvent>(
            GameEvents.SET_ACTIVE_ACTION,
            { action: buttonLayout.action }
          );
          // For touch, we might still want to register the touch start
          // but prevent the default game world interaction (setting target)
          // We'll let the touch proceed but the game controller should check
          // if the touch started on the UI.
          // For simplicity now, let's just prevent default world interaction.
          return; // Prevent default world interaction
        }
      }
      // --- End Action Bar Hit Test ---

      const position = calculateInputPosition(
        screenX,
        screenY,
        gameStateRef.current.renderState.viewport,
        canvas
      );

      setInputState((prev) => ({ ...prev, isPressed: true }));
      dispatchCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, {
        touches: [],
        primaryTouch: {
          identifier: touch.identifier,
          position,
          role: TouchRole.MOVEMENT,
          startTime: Date.now(),
        },
        timestamp: Date.now(),
      });
    },
    [gameStateRef, canvasRef]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current || !inputState.isPressed || !canvasRef.current)
        return;

      const viewport = gameStateRef.current.renderState.viewport;
      const touch = event.touches[0];
      if (!touch) return;

      const position = calculateInputPosition(
        touch.clientX,
        touch.clientY,
        viewport,
        canvasRef.current
      );
      dispatchCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, {
        touches: [],
        primaryTouch: {
          identifier: touch.identifier,
          position,
          role: TouchRole.MOVEMENT,
          startTime: Date.now(), // This startTime isn't really correct for move, consider removing or tracking properly
        },
        timestamp: Date.now(),
      });
    },
    [gameStateRef, canvasRef, inputState.isPressed]
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      // Check if the touch ended over an action bar button (optional, could trigger action on lift)
      // Currently, action triggers on touch start.

      setInputState((prev) => ({ ...prev, isPressed: false }));
      dispatchCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, {
        touches: [],
        changedTouches: [], // Populate properly if needed
        timestamp: Date.now(),
      });
    },
    [gameStateRef]
  );

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => handleMouseButtons(event, true);
    const handleMouseUp = (event: MouseEvent) => handleMouseButtons(event, false);
    const handleContextMenu = (event: Event) => event.preventDefault();

    const canvas = canvasRef.current;

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("contextmenu", handleContextMenu);

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("contextmenu", handleContextMenu);

      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [
    handleMouseButtons,
    handleMouseMove,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    canvasRef, // Add canvasRef dependency
  ]);

  return null;
}

function calculateInputPosition(
  clientX: number,
  clientY: number,
  viewport: ViewportState,
  canvas: HTMLCanvasElement
): InputPosition {
  const rect = canvas.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  // Adjust client coordinates relative to the canvas element
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;

  // Normalize based on canvas dimensions
  const normalizedX = (screenX / canvasWidth) * 2 - 1;
  const normalizedY = (screenY / canvasHeight) * 2 - 1;

  // Calculate world coordinates by reversing the viewport translation
  // worldX + viewport.x = screenX => worldX = screenX - viewport.x
  const worldX = screenX - viewport.x;
  const worldY = screenY - viewport.y;

  return {
    normalizedX,
    normalizedY,
    screenX: screenX, // Use coordinates relative to canvas
    screenY: screenY, // Use coordinates relative to canvas
    worldX,
    worldY,
    viewportWidth: canvasWidth, // Use canvas dimensions
    viewportHeight: canvasHeight, // Use canvas dimensions
  };
}

// Removed calculateWorldCoordinates as its logic is integrated into calculateInputPosition
