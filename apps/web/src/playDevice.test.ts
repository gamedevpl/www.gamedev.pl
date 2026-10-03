import { describe, expect, it } from 'vitest';
import { readPlayDevice } from './playDevice.js';

const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints, hardwareConcurrency: 10 });
describe('play device', () => {
  it('distinguishes a Mac from desktop-mode iPad without retaining the UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/26.0 Safari/605.1.15';
    expect(readPlayDevice(nav(ua))).toEqual({
      deviceClass: 'desktop',
      system: 'macos',
      browser: 'safari',
      browserMajor: 26,
      cpuBucket: 16,
    });
    expect(readPlayDevice(nav(ua, 5)).deviceClass).toBe('tablet');
  });
  it('classifies mobile platforms and gives Edge priority over its Chrome token', () => {
    expect(readPlayDevice(nav('Android Chrome/140.0 Mobile')).deviceClass).toBe('phone');
    expect(readPlayDevice(nav('iPhone CriOS/140.0 Mobile Safari/604.1')).browser).toBe('chrome');
    expect(readPlayDevice(nav('Windows Chrome/140.0 Safari/537.36 Edg/140.0')).browser).toBe('edge');
    expect(readPlayDevice(nav('unknown')).system).toBe('unknown');
  });
});

it('keeps host screen resolution and DPR separate from iframe rendering context', () => {
  expect(readPlayDevice(nav('Android Chrome/140.0 Mobile'), { width: 390, height: 844 }, 3)).toMatchObject({
    deviceClass: 'phone',
    screenWidth: 390,
    screenHeight: 844,
    displayDpr: 3,
  });
});
