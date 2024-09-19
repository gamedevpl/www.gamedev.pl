/** @define {boolean} */
var DEBUG = true;

/** @const */
var NULL = null;
/** @const */
var TRUE = true;
/** @const */
var FALSE = false;

/** const */
var MIN_TICK = 10;
var UPDATE_TICK = 100;

/** @const */
var GAME_STATE_INIT = 0;
/** @const */
var GAME_STATE_BATTLE_INIT = 1;
/** @const */
var GAME_STATE_PAUSE = 2;
/** @const */
var GAME_STATE_END = 3;

/** @const */
var LAYER_DEFAULT = 'layer-default';

/** @const */
var TYPE_ARCHER = 16;

/** @const */
var TYPE_WARRIOR = 17;

/** @const */
var TYPE_TANK = 18;

/** @const */
const EDGE_RADIUS = 800;

/** @const */
const MAX_LIFE = 100;

/** @const */
const SOLDIER_WIDTH = 32;
/** @const */
const SOLDIER_HEIGHT = 32;

/** @const */
const DESIGN_FIELD_WIDTH = 1600;
/** @const */
const DESIGN_FIELD_HEIGHT = 800;

/** @const */
const MAX_COL = DESIGN_FIELD_WIDTH / SOLDIER_WIDTH;
/** @const */
const MAX_ROW = DESIGN_FIELD_HEIGHT / SOLDIER_HEIGHT;

/** const */
var DEFAULT_UNITS = () => loadBattleString(null, "RgYEBAMEAgIGBAQIBAICBgQEDQQCAgYEBBIEAwIGBAQXBAMCBgQEHAQCAgYEBCEEAgIGBAQmBAICBhABEgoBAgYQARcMAQI=");