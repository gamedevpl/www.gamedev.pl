// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControllerView } from './ControllerView.js';

// Mock RoomClient
const mockSendInput = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();
let lastOnStatus: ((status: string, reason?: string) => void) | undefined;
let lastOnFrame: ((frame: any) => void) | undefined;

vi.mock('./roomClient.js', () => {
  return {
    RoomClient: vi.fn().mockImplementation((opts: any) => {
      lastOnStatus = opts.onStatus;
      lastOnFrame = opts.onFrame;
      return {
        connect: mockConnect,
        close: mockClose,
        sendInput: mockSendInput,
      };
    }),
  };
});

describe('ControllerView Voice Cleanup', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSendInput.mockClear();
    mockConnect.mockClear();
    mockClose.mockClear();
    lastOnStatus = undefined;
    lastOnFrame = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('stops voice recognition and releases pulsed keys when room is closed', async () => {
    let mockStop = vi.fn();
    let mockStart = vi.fn();
    let createdRecognition: any = null;

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onstart: (() => void) | null = null;
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        createdRecognition = this;
      }
      start = mockStart.mockImplementation(() => {
        if (this.onstart) this.onstart();
      });
      stop = mockStop;
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    act(() => {
      root.render(createElement(ControllerView, { code: 'TESTROOM', token: 'TOKEN123' }));
    });

    // Join room
    const joinBtn = container.querySelector('.controller-join-btn') as HTMLButtonElement;
    expect(joinBtn).not.toBeNull();
    act(() => {
      joinBtn.click();
    });

    // Simulate connected welcome
    act(() => {
      lastOnStatus?.('connected');
      lastOnFrame?.({ t: 'welcome', slot: 1, color: '#00e4ac', phase: 'playing' });
    });

    // Toggle Voice On
    const voiceBtn = container.querySelector('.controller-voice-btn') as HTMLButtonElement;
    expect(voiceBtn).not.toBeNull();
    act(() => {
      voiceBtn.click();
    });

    expect(mockStart).toHaveBeenCalled();

    // Trigger voice recognition result -> pulseKey('up')
    act(() => {
      createdRecognition.onresult({
        results: [[{ transcript: 'up' }]],
      });
    });

    // Key down (1) should have been sent immediately for 'up'
    expect(mockSendInput).toHaveBeenLastCalledWith('up', 1);

    // Now close room before pulse timer (140ms) expires
    act(() => {
      lastOnFrame?.({ t: 'closed', reason: 'expired' });
    });

    // Voice recognition must be stopped
    expect(mockStop).toHaveBeenCalled();

    // Key up (0) MUST be sent for 'up' upon stopping voice
    expect(mockSendInput).toHaveBeenLastCalledWith('up', 0);
  });
});
