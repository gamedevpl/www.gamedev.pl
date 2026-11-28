import type { PlatformCapabilities } from '../types.js';
import { webAuth } from './auth.js';
import { webInstall } from './install.js';
import { webOrientation } from './orientation.js';
import { webPush } from './push.js';
import { webQr } from './qr.js';
import { webShare } from './share.js';
import { webTilt } from './tilt.js';
import { webWakeLock } from './wakeLock.js';

export const webPlatform: PlatformCapabilities = {
  share: webShare,
  push: webPush,
  wakeLock: webWakeLock,
  orientation: webOrientation,
  tilt: webTilt,
  install: webInstall,
  qr: webQr,
  auth: webAuth,
};
