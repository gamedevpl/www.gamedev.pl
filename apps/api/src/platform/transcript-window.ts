// Window caps for one page of a build's creator conversation.

// The MCP get_transcript schema advertises these, so both surfaces read one number.

// Window size when the caller asks for none.
export const DEFAULT_TRANSCRIPT_WINDOW_ENTRIES = 20;

// Ceiling on a caller's requested limit.
export const MAX_TRANSCRIPT_WINDOW_ENTRIES = 50;

// Per-window byte ceiling; a long entry shrinks the window instead.
export const MAX_TRANSCRIPT_WINDOW_BYTES = 20_000;
