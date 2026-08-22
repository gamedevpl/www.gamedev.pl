// Size budgets a game's own content is held to.

// Opaque game-authored save JSON; never parsed by the platform.
export const MAX_GAME_SAVE_BYTES = 32 * 1024;

// Longest a game title may be.
export const MAX_TITLE_LENGTH = 80;

// Party mode seats, one per slot colour.
export const MAX_MULTIPLAYER_SLOTS = 8;

// One screenshot upload, measured after base64 decoding.
export const MAX_SHOT_BYTES = 300 * 1024;
