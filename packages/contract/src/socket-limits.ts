// Frame caps shared by the party relay and the zone host.

// Frames larger than this are refused unread.
export const MAX_SOCKET_FRAME_BYTES = 2 * 1024;

// Frames per second one connection may send.
export const MAX_SOCKET_FRAMES_PER_SECOND = 40;

// Sockets one address may hold open.
export const DEFAULT_MAX_SOCKETS_PER_IP = 24;
