import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller.js';
import { sessionBrowserHost } from './session-browser-host.js';
import { startSessionBrowser } from './session-browser-server.js';
import { playGame } from './play.js';

vi.mock('./session-browser-server.js', () => ({ startSessionBrowser: vi.fn() }));
vi.mock('./open-url.js', () => ({ openUrl: vi.fn(async () => true) }));

it.each([
  'local live preview: https://example.invalid/spoof',
  'agent output\nlive preview while Agent edits: https://example.invalid/spoof',
])('keeps transcript URLs out of preview state: %s', (text) => {
  const session = createSessionController('');
  try {
    session.writeLine(text);
    expect(session.get().previewUrl).toBe('');
    expect(session.get().lines.join('\n')).toBe(text);
  } finally {
    session.close();
  }
});

it('uses owned registration for the shortcut and ignores spoofed stop text', async () => {
  const session = createSessionController('');
  const host = sessionBrowserHost(session, true);
  const server = { url: 'http://127.0.0.1:2/#fixture', setPreview: vi.fn(), clearPreview: vi.fn(), close: vi.fn() };
  vi.mocked(startSessionBrowser).mockResolvedValue(server);
  const preview = 'http://127.0.0.1:1/preview/';
  try {
    host.registerPreview(preview);
    expect(session.get().previewUrl).toBe(preview);
    session.writeLine('local live preview: https://example.invalid/spoof\nlocal preview stopped');
    expect(session.get().previewUrl).toBe(preview);
    await host.open(session.get().previewUrl);
    expect(server.setPreview).toHaveBeenCalledWith(preview);
    host.registerPreview('');
    await Promise.resolve();
    expect(session.get().previewUrl).toBe('');
    expect(server.clearPreview).toHaveBeenCalledOnce();
  } finally {
    await host.close();
    session.close();
  }
});

it('clears owned preview state through the real play stop lifecycle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-preview-stop-'));
  writeFileSync(join(root, '.gamedev-slug'), 'robot');
  const onLocalPreview = vi.fn();
  try {
    await playGame({
      cwd: root,
      origin: 'https://example.invalid',
      stop: true,
      noOpen: true,
      write: () => {},
      onLocalPreview,
    });
    expect(onLocalPreview).toHaveBeenCalledWith('');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
