import { describe, expect, it, vi } from 'vitest';
import { interceptPlayPermalink } from './playPermalink.js';

function click(extra: Partial<Parameters<typeof interceptPlayPermalink>[0]> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...extra,
  };
}

describe('interceptPlayPermalink', () => {
  it('keeps an unmodified left-click in the app', () => {
    const onPlayPermalink = vi.fn();
    const event = click();
    interceptPlayPermalink(event, 'sky-dodge', onPlayPermalink);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onPlayPermalink).toHaveBeenCalledWith('sky-dodge');
  });

  it('leaves modified clicks to the real permalink', () => {
    const onPlayPermalink = vi.fn();
    interceptPlayPermalink(click({ metaKey: true }), 'sky-dodge', onPlayPermalink);
    expect(onPlayPermalink).not.toHaveBeenCalled();
  });
});
