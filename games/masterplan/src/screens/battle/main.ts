import { EVENT_DOCUMENT_HIDDEN, EVENT_DOCUMENT_VISIBLE, EVENT_WINDOW_RESIZE } from './events';
import { updateState } from './states';

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
