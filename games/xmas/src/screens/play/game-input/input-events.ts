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

// Mouse position relative to canvas/viewport
export type MousePosition = {
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