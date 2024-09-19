var eventCounter = 0;

// hash change
var EVENT_HASHCHANGE = eventCounter++;

// generic events
/** @const */
var EVENT_TIMEOUT = eventCounter++;
var EVENT_RAF = eventCounter++;
var EVENT_READYSTATE = eventCounter++;
var EVENT_DOCUMENT_HIDDEN = eventCounter++;
var EVENT_DOCUMENT_VISIBLE = eventCounter++;

var EVENT_INTERVAL_100MS = eventCounter++;
var EVENT_INTERVAL_SECOND = eventCounter++;

var EVENT_WINDOW_RESIZE = eventCounter++;

// game events
var EVENT_RACE_OVER = eventCounter++;

// menu events
/** @const */
var EVENT_MENU_PLAY = eventCounter++;

// controls
var EVENT_ESCAPE = eventCounter++;

var EVENT_MOUSE_DOWN = eventCounter++;
var EVENT_MOUSE_UP = eventCounter++;
var EVENT_MOUSE_MOVE = eventCounter++;
var EVENT_MOUSE_CLICK = eventCounter++;

var EVENT_KEY_DOWN = eventCounter++;
var EVENT_KEY_UP = eventCounter++;

var EVENT_ARROW_LEFT_DOWN = eventCounter++;
var EVENT_ARROW_RIGHT_DOWN = eventCounter++;
var EVENT_ARROW_UP_DOWN = eventCounter++;
var EVENT_ARROW_DOWN_DOWN = eventCounter++;

var EVENT_ARROW_LEFT_UP = eventCounter++;
var EVENT_ARROW_RIGHT_UP = eventCounter++;
var EVENT_ARROW_UP_UP = eventCounter++;
var EVENT_ARROW_DOWN_UP = eventCounter++;

var EVENT_TOUCH_START = eventCounter++; 

// battle
var EVENT_DAMAGE = eventCounter++;
var EVENT_DAMAGE_ARROW = eventCounter++;