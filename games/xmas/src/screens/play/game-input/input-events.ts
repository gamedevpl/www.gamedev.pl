export enum GameEvents {
  // Fireball events
  CREATE_FIREBALL = 'game:create-fireball',
  UPDATE_FIREBALL = 'game:update-fireball',
  START_CHARGING = 'game:start-charging',
  STOP_CHARGING = 'game:stop-charging',

  // Santa movement events
  MOVE_SANTA = 'game:move-santa',
  SET_SANTA_DIRECTION = 'game:set-santa-direction',
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

// Type guard helper functions
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProperty<T extends Record<string, unknown>, K extends string>(
  obj: T,
  prop: K,
): obj is T & Record<K, unknown> {
  return prop in obj;
}

// Type guard functions for type safety
export function isMoveSantaEvent(event: unknown): event is MoveSantaEvent {
  if (!isObject(event) || !hasProperty(event, 'input')) return false;

  const input = event.input;
  if (!isObject(input)) return false;

  return (
    typeof input === 'object' &&
    hasProperty(input, 'left') &&
    hasProperty(input, 'right') &&
    hasProperty(input, 'up') &&
    hasProperty(input, 'down') &&
    typeof input.left === 'boolean' &&
    typeof input.right === 'boolean' &&
    typeof input.up === 'boolean' &&
    typeof input.down === 'boolean'
  );
}

export function isSetSantaDirectionEvent(event: unknown): event is SetSantaDirectionEvent {
  if (!isObject(event) || !hasProperty(event, 'direction')) return false;

  return event.direction === 'left' || event.direction === 'right';
}

export function isStartChargingEvent(event: unknown): event is StartChargingEvent {
  if (!isObject(event)) return false;

  return hasProperty(event, 'timestamp') && typeof event.timestamp === 'number';
}

export function isStopChargingEvent(event: unknown): event is StopChargingEvent {
  if (!isObject(event)) return false;

  return hasProperty(event, 'timestamp') && typeof event.timestamp === 'number';
}
