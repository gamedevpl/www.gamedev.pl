import { EntityId } from '../game-world/entities/entities-types';
import { Vector2D } from '../game-world/utils/math-types';

export enum GameEvents {
  // Mouse input events
  MOUSE_MOVE = 'game:mouse-move',
  MOUSE_BUTTON = 'game:mouse-button',

  // Touch input events
  TOUCH_START = 'game:touch-start',
  TOUCH_MOVE = 'game:touch-move',
  TOUCH_END = 'game:touch-end',

  // Lion movement events
  SET_LION_TARGET = 'game:set-lion-target',
  CANCEL_CHASE = 'game:cancel-chase',
  TOGGLE_ACTION = 'game:toggle-action',
}

// Lion Movement Events
export type LionTargetEvent = {
  position: Vector2D | undefined;
  preyId?: EntityId | undefined;
};

export type CancelChaseEvent = {
  position: {
    x: number;
    y: number;
  } | null;
};

export type ToggleActionEvent = {
  action: 'walk' | 'attack' | 'ambush';
  enabled: boolean;
};

// Common position type for both mouse and touch events
export type InputPosition = {
  // Normalized coordinates (-1 to 1, where 0,0 is center)
  normalizedX: number;
  normalizedY: number;
  // Raw screen coordinates
  screenX: number;
  screenY: number;
  // World coordinates (accounting for viewport translation)
  worldX: number;
  worldY: number;
  // Viewport dimensions
  viewportWidth: number;
  viewportHeight: number;
};

// Mouse position (aliased to maintain backward compatibility)
export type MousePosition = InputPosition;

// Mouse button types
export type MouseButton = 'left' | 'right';

// Mouse Events
export type MouseMoveEvent = {
  position: MousePosition;
  timestamp: number;
};

export type MouseButtonEvent = {
  button: MouseButton;
  isPressed: boolean;
  position: MousePosition;
  timestamp: number;
};

// Touch role enum to differentiate between movement and action touches
export enum TouchRole {
  MOVEMENT = 'movement',
  ACTION = 'action',
  UNASSIGNED = 'unassigned',
}

// Enhanced TouchPoint type with action state
export type TouchPoint = {
  identifier: number;
  position: InputPosition;
  role: TouchRole;
  startTime: number;
};

// Enhanced touch event types
export type TouchStartEvent = {
  touches: TouchPoint[];
  primaryTouch: TouchPoint;
  actionTouch?: TouchPoint;
  timestamp: number;
};

export type TouchMoveEvent = {
  touches: TouchPoint[];
  primaryTouch: TouchPoint;
  actionTouch?: TouchPoint;
  timestamp: number;
};

export type TouchEndEvent = {
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
  timestamp: number;
};
