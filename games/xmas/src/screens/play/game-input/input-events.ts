export enum GameEvents {
  // Fireball events
  START_CHARGING = 'game:start-charging',
  STOP_CHARGING = 'game:stop-charging',

  // Santa movement events
  MOVE_SANTA = 'game:move-santa',
  SET_SANTA_DIRECTION = 'game:set-santa-direction',

  // Mouse input events
  MOUSE_MOVE = 'game:mouse-move',
  MOUSE_BUTTON = 'game:mouse-button',

  // Touch input events
  TOUCH_START = 'game:touch-start',
  TOUCH_MOVE = 'game:touch-move',
  TOUCH_END = 'game:touch-end'
}

export type StartChargingEvent = {
  timestamp: number;
};

export type StopChargingEvent = {
  timestamp: number;
};

// Santa Movement Events
export type MoveSantaEvent = {
  input: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  };
};

export type SetSantaDirectionEvent = {
  direction: 'left' | 'right';
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

// Touch role enum to differentiate between movement and charging touches
export enum TouchRole {
  MOVEMENT = 'movement',
  CHARGING = 'charging',
  UNASSIGNED = 'unassigned'
}

// Enhanced TouchPoint type with charging state
export type TouchPoint = {
  identifier: number;
  position: InputPosition;
  role: TouchRole;
  startTime: number;
  // Charging-specific properties
  isCharging?: boolean;
  chargeStartTime?: number;
};

// Enhanced touch event types
export type TouchStartEvent = {
  touches: TouchPoint[];
  primaryTouch: TouchPoint;
  chargingTouch?: TouchPoint;
  timestamp: number;
};

export type TouchMoveEvent = {
  touches: TouchPoint[];
  primaryTouch: TouchPoint;
  chargingTouch?: TouchPoint;
  timestamp: number;
};

export type TouchEndEvent = {
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
  wasCharging: boolean; // Indicates if a charging touch was released
  timestamp: number;
};