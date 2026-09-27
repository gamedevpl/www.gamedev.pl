// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { postGameHostMessage } from './gamePlayer.js';
import { markGameFrameLoadedByHost, markGameFrameNavigatedAway } from './frameMessage.js';

it('withholds host payloads after navigation and permits owner reloads', () => {
  const frame = document.createElement('iframe');
  const postMessage = vi.fn();
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage } });
  markGameFrameNavigatedAway(frame);
  postGameHostMessage(frame, { type: 'restoreState', data: { secret: 'snapshot' } });
  expect(postMessage).not.toHaveBeenCalled();
  markGameFrameLoadedByHost(frame);
  postGameHostMessage(frame, { type: 'hello' });
  expect(postMessage).toHaveBeenCalledWith({ source: 'gdpl-host', type: 'hello' }, '*');
});
