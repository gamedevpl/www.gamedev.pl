import type { QrPlatform, QrScanResult } from '../types.js';

// No browser exposes a QR API; native uses its camera SDK.
function supported(): boolean {
  return false;
}

async function scan(): Promise<QrScanResult> {
  return { unsupported: true };
}

export const webQr: QrPlatform = { supported, scan };
