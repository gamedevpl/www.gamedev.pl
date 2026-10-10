// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import i18n from '../../i18n/index.js';
import { dispatchFromFrame } from '../../test-utils/frameMessage.js';
import { performanceWindow, playBatches } from '../../test-utils/playTelemetry.js';
import { StudioStage, type StudioStageProps } from './StudioStage.js';

let host: HTMLDivElement;
let root: Root;
let fetchSpy: MockInstance<typeof globalThis.fetch>;
const html = '<html><body><canvas>published</canvas></body></html>';

function props(overrides: Partial<StudioStageProps> = {}): StudioStageProps {
  return {
    token: 'token',
    title: 'Biplane',
    slug: 'biplane-skirmish',
    published: true,
    source: {
      html,
      rawHtml: html,
      origin: { kind: 'delivered', at: null, versionLabel: null, artifactVersion: 'a'.repeat(64) },
    },
    posture: 'play',
    onPostureChange: vi.fn(),
    covered: false,
    ...overrides,
  };
}

async function render(next: StudioStageProps) {
  await act(async () => root.render(<StudioStage {...next} />));
}

function alive() {
  dispatchFromFrame(host.querySelector('iframe')!.contentWindow!, {
    source: 'gdpl-player',
    type: 'alive',
    frames: 300,
    performance: performanceWindow,
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('collects published Studio play, but excludes watch and covered windows', async () => {
  const base = props();
  await render({ ...base, posture: 'watch' });
  alive();
  expect(playBatches(fetchSpy)).toHaveLength(0);
  await render(base);
  expect(playBatches(fetchSpy)[0]).toMatchObject({
    slug: 'biplane-skirmish',
    events: [{ type: 'game_opened', artifactVersion: 'a'.repeat(64), device: { deviceClass: expect.any(String) } }],
  });
  alive();
  await render({ ...base, covered: true });
  alive();
  await render(base);
  alive();
  await render({ ...base, posture: 'watch' });
  const batches = playBatches(fetchSpy);
  expect(batches).toHaveLength(2);
  expect(batches[1].sessionId).toBe(batches[0].sessionId);
  expect(batches[1].events).toMatchObject([
    { type: 'alive', performance: performanceWindow },
    { type: 'alive', performance: performanceWindow },
    { type: 'game_closed' },
  ]);
});

it('does not attribute staged previews to published content', async () => {
  const base = props();
  await render({ ...base, source: { ...base.source, origin: { kind: 'staged', at: null, versionLabel: null } } });
  alive();
  expect(playBatches(fetchSpy)).toHaveLength(0);
  await render(base);
  expect(playBatches(fetchSpy)[0].events[0].artifactVersion).toBe('a'.repeat(64));
});

it('keeps attribution on the displayed build until a pending swap is applied', async () => {
  const base = props();
  await render(base);
  dispatchFromFrame(host.querySelector('iframe')!.contentWindow!, { source: 'gdpl-player', type: 'held', held: true });
  const nextHtml = '<html><canvas>next</canvas></html>';
  const next = {
    ...base,
    source: { html: nextHtml, rawHtml: nextHtml, origin: { ...base.source.origin, artifactVersion: 'b'.repeat(64) } },
  };
  await render(next);
  alive();
  expect(playBatches(fetchSpy)).toHaveLength(1);
  await render({ ...next, posture: 'watch' });
  await render(next);
  const batches = playBatches(fetchSpy);
  expect(batches).toHaveLength(3);
  expect(batches[1].events).toMatchObject([{ type: 'alive' }, { type: 'game_closed' }]);
  expect(batches[2].events[0].artifactVersion).toBe('b'.repeat(64));
  expect(batches[2].sessionId).not.toBe(batches[0].sessionId);
});
