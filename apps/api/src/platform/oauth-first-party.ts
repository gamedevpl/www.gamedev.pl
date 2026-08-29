import type { OAuthClientRecord } from './store.js';

export const GAMEDEV_CLI_CLIENT_ID = 'gamedev-cli';

const GAMEDEV_CLI_CREATED_AT = '2026-01-01T00:00:00.000Z';

export function gamedevCliClient(): OAuthClientRecord {
  return {
    clientId: GAMEDEV_CLI_CLIENT_ID,
    registrationType: 'first-party',
    redirectUris: ['http://127.0.0.1/callback', 'http://[::1]/callback'],
    clientName: 'gamedevpl CLI',
    tokenEndpointAuthMethod: 'none',
    createdAt: GAMEDEV_CLI_CREATED_AT,
  };
}

export function isGamedevCliClient(clientId: string): boolean {
  return clientId === GAMEDEV_CLI_CLIENT_ID;
}

const DEVICE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 ._:-]{0,39}$/;

export function sanitizeDeviceName(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (DEVICE_NAME_PATTERN.test(trimmed)) return trimmed;
  return 'this device';
}

export function gamedevCliGrantLabel(deviceName: string): string {
  return `gamedevpl CLI on ${deviceName}`;
}
