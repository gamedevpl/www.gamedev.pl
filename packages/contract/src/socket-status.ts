// Lifecycle of a realtime socket, shared by party and zone clients.
export const SOCKET_STATUSES = ['connecting', 'connected', 'reconnecting', 'closed'] as const;
export type SocketStatus = (typeof SOCKET_STATUSES)[number];
