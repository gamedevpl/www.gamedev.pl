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

export function initializeControls(updateState) {
  // key events
  window.addEventListener('keydown', function (event) {
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

  window.addEventListener('keyup', function (event) {
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
  window.addEventListener('mousedown', function (event) {
    updateState(EVENT_MOUSE_DOWN, event);
  });

  window.addEventListener('mouseup', function (event) {
    updateState(EVENT_MOUSE_UP, event);
  });

  window.addEventListener('mousemove', function (event) {
    updateState(EVENT_MOUSE_MOVE, event);
  });

  window.addEventListener('click', function (event) {
    updateState(EVENT_MOUSE_CLICK, event);
  });
}