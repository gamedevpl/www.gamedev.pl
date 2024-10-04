import { initializeControls } from './controls.js';
import {
  EVENT_RAF,
  EVENT_BATTLE_START,
  EVENT_DOCUMENT_HIDDEN,
  EVENT_DOCUMENT_VISIBLE,
  EVENT_WINDOW_RESIZE,
} from './events.js';
import { updateState } from './states.js';

let lastTick = Date.now();
function updateAnimation() {
  let newTick = Date.now();
  updateState(EVENT_RAF, newTick - lastTick);
  lastTick = newTick;
  requestAnimationFrame(updateAnimation);
}

requestAnimationFrame(updateAnimation);

initializeControls(updateState);

document.addEventListener('battleStart', (event) => {
  updateState(EVENT_BATTLE_START, {
    playerUnits: event.detail.playerUnits,
    oppositionUnits: event.detail.oppositionUnits,
  });
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    updateState(EVENT_DOCUMENT_HIDDEN);
  } else {
    updateState(EVENT_DOCUMENT_VISIBLE);
  }
});

window.addEventListener('resize', function () {
  updateState(EVENT_WINDOW_RESIZE);
});
