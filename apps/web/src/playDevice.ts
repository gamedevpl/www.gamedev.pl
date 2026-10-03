import type { PlayDevice } from '@gamedevpl/contract';

export function readPlayDevice(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints' | 'hardwareConcurrency'> & { deviceMemory?: number },
  display?: Pick<Screen, 'width' | 'height'>,
  displayDpr?: number,
): PlayDevice {
  const ua = nav.userAgent;
  const system: PlayDevice['system'] = /Android/i.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1)
      ? 'ios'
      : /Mac/i.test(ua)
        ? 'macos'
        : /Windows/i.test(ua)
          ? 'windows'
          : /Linux/i.test(ua)
            ? 'linux'
            : 'unknown';
  const deviceClass: PlayDevice['deviceClass'] =
    /iPhone|iPod/i.test(ua) || (system === 'android' && /Mobile/i.test(ua))
      ? 'phone'
      : system === 'ios' || system === 'android'
        ? 'tablet'
        : system === 'unknown'
          ? 'unknown'
          : 'desktop';
  const match =
    /(Edg|EdgiOS|EdgA)\/(\d+)/.exec(ua) ??
    /(Firefox|FxiOS)\/(\d+)/.exec(ua) ??
    /(Chrome|CriOS)\/(\d+)/.exec(ua) ??
    /(Version)\/(\d+)/.exec(ua);
  const browser: PlayDevice['browser'] = !match
    ? 'unknown'
    : /^Edg/.test(match[1])
      ? 'edge'
      : /Firefox|FxiOS/.test(match[1])
        ? 'firefox'
        : /Chrome|CriOS/.test(match[1])
          ? 'chrome'
          : /Safari/.test(ua)
            ? 'safari'
            : 'unknown';
  const cpu = nav.hardwareConcurrency;
  const memory = nav.deviceMemory;
  return {
    deviceClass,
    system,
    browser,
    ...(display ? { screenWidth: display.width, screenHeight: display.height } : {}),
    ...(displayDpr === undefined ? {} : { displayDpr }),
    ...(match && Number(match[2]) <= 999 ? { browserMajor: Number(match[2]) } : {}),
    ...(Number.isFinite(cpu) && cpu > 0 ? { cpuBucket: [1, 2, 4, 8, 16].find((n) => cpu <= n) ?? 16 } : {}),
    ...(typeof memory === 'number' && [0.25, 0.5, 1, 2, 4, 8].includes(memory) ? { memoryBucket: memory } : {}),
  };
}
