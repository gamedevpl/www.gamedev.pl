import { initializeControls } from './controls.js';
import { EVENT_DOCUMENT_HIDDEN, EVENT_DOCUMENT_VISIBLE, EVENT_WINDOW_RESIZE } from './events.js';
import { updateState } from './states.js';

initializeControls(updateState);

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
