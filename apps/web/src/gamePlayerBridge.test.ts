// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from './gamePlayer.js';

/*
 * The bridge ships as a source string injected into an opaque-origin game document, so
 * it is the one part of the player that no type-checker and no import graph can reach.
 * These tests run the string that actually ships, in a document shaped like a real game
 * document, and read what it posts.
 *
 * What it reports is the game's own account of its controls — the input the How-to-play
 * card trusts first. If the scraper silently stops finding rows, the card quietly falls
 * back to a catalog string that is English-only and absent on a deep link, and nothing
 * else in the suite would notice.
 */

/** Pull the injected bridge out of an embedded document, as the iframe would run it. */
function bridgeSource(): string {
  const embedded = embedGameHtml('<html><head></head><body></body></html>');
  const match = embedded.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('no bridge script in the embedded document');
  return match[1];
}

type Posted = { type?: string; rows?: unknown; kit?: unknown; hint?: unknown };

/**
 * Runs the bridge against a game-shaped document and returns everything it posted.
 *
 * `parent` is this same window under jsdom, so the bridge's `parent.postMessage` lands
 * on a listener here — the same path a real frame takes to reach the host.
 */
async function runBridge(bodyHtml: string, gameKit?: Record<string, unknown>): Promise<Posted[]> {
  document.body.innerHTML = bodyHtml;
  if (gameKit) (window as unknown as Record<string, unknown>).GameKit = gameKit;

  const posted: Posted[] = [];
  const collect = (event: MessageEvent) => {
    if (event.data?.source === 'gdpl-player') posted.push(event.data as Posted);
  };
  window.addEventListener('message', collect);
  // Indirect eval so the bridge's `var`s land on the window, as they do in a real frame.
  (0, eval)(bridgeSource());
  // jsdom queues postMessage delivery; let the microtask/macrotask queue drain.
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.removeEventListener('message', collect);
  return posted;
}

function controlsFrom(posted: Posted[]): Posted | undefined {
  return posted.filter((message) => message.type === 'controls').at(-1);
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as Record<string, unknown>).GameKit;
});

describe('the bridge control scraper', () => {
  it('reads the shell popup as key/action rows, already localized by the game', async () => {
    // The markup every game template scaffolds. `dt` and `dd` are siblings inside the
    // list, not wrapped per row, so pairing is positional.
    const controls = controlsFrom(
      await runBridge(`
        <div class="game-controls">
          <details class="legend">
            <div class="legend-card">
              <dl class="legend-keys">
                <dt>&larr; &rarr; / A D</dt><dd>Skręt</dd>
                <dt>Spacja</dt><dd>Ogień</dd>
              </dl>
            </div>
          </details>
        </div>`),
    );
    expect(controls?.rows).toEqual([
      { keys: '← → / A D', action: 'Skręt' },
      { keys: 'Spacja', action: 'Ogień' },
    ]);
  });

  it('skips a term with no definition rather than pairing across rows', async () => {
    // A hand-edited popup can leave a dangling dt. Pairing it with the *next* row's dd
    // would attach every action to the wrong key from that point on.
    const controls = controlsFrom(
      await runBridge(`
        <dl class="legend-keys">
          <dt>W</dt><dd>Up</dd>
          <dt>Orphan</dt>
          <dt>S</dt><dd>Down</dd>
        </dl>`),
    );
    expect(controls?.rows).toEqual([
      { keys: 'W', action: 'Up' },
      { keys: 'S', action: 'Down' },
    ]);
  });

  it('reports the touch buttons GameKit mounted, which no other source can name', async () => {
    const controls = controlsFrom(
      await runBridge('<canvas id="game"></canvas>', {
        controlsManifest: () => ({
          pad: 'full',
          look: false,
          steer: 'origin',
          buttons: [
            { keys: [' '], label: 'Fire' },
            { keys: ['shift', 'x'], label: 'Throttle' },
          ],
          touch: true,
        }),
      }),
    );
    expect(controls?.kit).toEqual([
      { keys: ' ', action: 'Fire', touch: true },
      { keys: 'shift / x', action: 'Throttle', touch: true },
      { keys: '', action: '', pad: 'full' },
    ]);
  });

  it('reports nothing from GameKit when the game mounted no input', async () => {
    // A game whose script died before createInput, and an older snapshot built before
    // controlsManifest existed, are the same case here: report what is known, not a guess.
    expect(controlsFrom(await runBridge('<canvas id="game"></canvas>', {}))?.kit).toEqual([]);
    expect(controlsFrom(await runBridge('<canvas id="game"></canvas>', { controlsManifest: () => null }))?.kit).toEqual(
      [],
    );
  });

  it('survives a GameKit that throws, because a broken game must still be playable', async () => {
    const posted = await runBridge('<p class="hint">W to jump</p>', {
      controlsManifest: () => {
        throw new Error('game is on fire');
      },
    });
    const controls = controlsFrom(posted);
    expect(controls?.kit).toEqual([]);
    expect(controls?.hint).toBe('W to jump');
  });

  it('falls back to the one-line hint every game ships', async () => {
    const controls = controlsFrom(await runBridge('<p class="hint">A/D  steer,\n  Space fire</p>'));
    expect(controls?.rows).toEqual([]);
    // Whitespace is collapsed at the source: the hint is authored across lines in markup.
    expect(controls?.hint).toBe('A/D steer, Space fire');
  });

  it('posts an empty report for a document with no controls anywhere', async () => {
    // Not silence: the host needs to hear "this game said nothing" to fall back rather
    // than wait forever for a message that is never coming.
    const controls = controlsFrom(await runBridge('<canvas id="game"></canvas>'));
    expect(controls).toBeDefined();
    expect(controls?.rows).toEqual([]);
    expect(controls?.hint).toBe('');
  });
});
