import '../css/main.css';
import { initializeControls } from './controls.js';
import {
  EVENT_RAF,
  EVENT_BATTLE_START,
  EVENT_DOCUMENT_HIDDEN,
  EVENT_DOCUMENT_VISIBLE,
  EVENT_HASHCHANGE,
  EVENT_WINDOW_RESIZE,
} from './events.js';
import { updateState } from './states.js';
import { currentTime } from './util.js';

let lastTick = currentTime();
function updateAnimation() {
  let newTick = currentTime();
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

window.addEventListener('hashchange', function () {
  updateState(EVENT_HASHCHANGE, document.location.hash);
});

window.addEventListener('resize', function () {
  updateState(EVENT_WINDOW_RESIZE);
});
