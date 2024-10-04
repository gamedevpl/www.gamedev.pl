import { useEffect } from 'react';
import {
  EVENT_ARROW_DOWN_DOWN,
  EVENT_ARROW_DOWN_UP,
  EVENT_ARROW_LEFT_DOWN,
  EVENT_ARROW_LEFT_UP,
  EVENT_ARROW_RIGHT_DOWN,
  EVENT_ARROW_RIGHT_UP,
  EVENT_ARROW_UP_DOWN,
  EVENT_ARROW_UP_UP,
  EVENT_ESCAPE,
  EVENT_KEY_DOWN,
  EVENT_KEY_UP,
  EVENT_MOUSE_CLICK,
  EVENT_MOUSE_DOWN,
  EVENT_MOUSE_MOVE,
  EVENT_MOUSE_UP,
} from './events.js';
import { updateState } from './states.js';

function useWindowEvent<T extends Event>(name: keyof WindowEventMap, handler: (event: T) => void) {
  useEffect(() => {
    window.addEventListener(name, handler as EventListener);
    return () => {
      window.removeEventListener(name, handler as EventListener);
    };
  }, [name, handler]);
}

export function BattleControls() {
  // key events
  useWindowEvent<KeyboardEvent>('keydown', function (event) {
    if (event.keyCode == 37) {
      updateState(EVENT_ARROW_LEFT_DOWN);
    }
    if (event.keyCode == 38) {
      updateState(EVENT_ARROW_UP_DOWN);
    }
    if (event.keyCode == 39) {
      updateState(EVENT_ARROW_RIGHT_DOWN);
    }
    if (event.keyCode == 40) {
      updateState(EVENT_ARROW_DOWN_DOWN);
    }
    if (event.keyCode == 27) {
      updateState(EVENT_ESCAPE);
    }
    updateState(EVENT_KEY_DOWN, event.keyCode);
  });

  useWindowEvent<KeyboardEvent>('keyup', function (event) {
    if (event.keyCode == 37) {
      updateState(EVENT_ARROW_LEFT_UP);
    }
    if (event.keyCode == 38) {
      updateState(EVENT_ARROW_UP_UP);
    }
    if (event.keyCode == 39) {
      updateState(EVENT_ARROW_RIGHT_UP);
    }
    if (event.keyCode == 40) {
      updateState(EVENT_ARROW_DOWN_UP);
    }
    updateState(EVENT_KEY_UP, event);
  });

  // mouse events
  useWindowEvent('mousedown', function (event) {
    updateState(EVENT_MOUSE_DOWN, event);
  });

  useWindowEvent('mouseup', function (event) {
    updateState(EVENT_MOUSE_UP, event);
  });

  useWindowEvent('mousemove', function (event) {
    updateState(EVENT_MOUSE_MOVE, event);
  });

  useWindowEvent('click', function (event) {
    updateState(EVENT_MOUSE_CLICK, event);
  });

  return null;
}
