let eventCounter = 0;

// generic events
/** @const */
export const EVENT_TIMEOUT = eventCounter++;
export const EVENT_RAF = eventCounter++;
export const EVENT_BATTLE_START = eventCounter++;
export const EVENT_DOCUMENT_HIDDEN = eventCounter++;
export const EVENT_DOCUMENT_VISIBLE = eventCounter++;

export const EVENT_INTERVAL_100MS = eventCounter++;
export const EVENT_INTERVAL_SECOND = eventCounter++;

export const EVENT_WINDOW_RESIZE = eventCounter++;

// menu events
export const EVENT_ESCAPE = eventCounter++;

export const EVENT_MOUSE_DOWN = eventCounter++;
export const EVENT_MOUSE_UP = eventCounter++;
export const EVENT_MOUSE_MOVE = eventCounter++;
export const EVENT_MOUSE_CLICK = eventCounter++;

export const EVENT_KEY_DOWN = eventCounter++;
export const EVENT_KEY_UP = eventCounter++;

export const EVENT_ARROW_LEFT_DOWN = eventCounter++;
export const EVENT_ARROW_RIGHT_DOWN = eventCounter++;
export const EVENT_ARROW_UP_DOWN = eventCounter++;
export const EVENT_ARROW_DOWN_DOWN = eventCounter++;

export const EVENT_ARROW_LEFT_UP = eventCounter++;
export const EVENT_ARROW_RIGHT_UP = eventCounter++;
export const EVENT_ARROW_UP_UP = eventCounter++;
export const EVENT_ARROW_DOWN_UP = eventCounter++;

// battle
export const EVENT_DAMAGE = eventCounter++;
export const EVENT_DAMAGE_ARROW = eventCounter++;

// battle control
export const EVENT_BATTLE_PAUSE = eventCounter++;
export const EVENT_BATTLE_RESUME = eventCounter++;
export const EVENT_BATTLE_STOP = eventCounter++;

// fast finish
export const EVENT_BATTLE_FAST_FINISH = eventCounter++;
