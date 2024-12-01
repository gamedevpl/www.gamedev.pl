export enum GameEvents {
  // Fireball events
  START_CHARGING = 'game:start-charging',
  STOP_CHARGING = 'game:stop-charging',

  // Gift throwing events
  START_THROWING_GIFT = 'game:start-throwing-gift',
  STOP_THROWING_GIFT = 'game:stop-throwing-gift',

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

export type StartThrowingGiftEvent = {
  timestamp: number;
};

export type StopThrowingGiftEvent = {
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
