import { webPlatform } from './web/index.js';
import type { PlatformCapabilities } from './types.js';

// The one seam: nothing outside this directory may branch on platform.
export const platform: PlatformCapabilities = webPlatform;
// A native (Capacitor) resolver replaces this once one ships.

export type * from './types.js';
