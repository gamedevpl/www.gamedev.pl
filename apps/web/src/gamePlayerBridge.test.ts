import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from './gamePlayer.js';

/*
 * jsdom is a devDependency here but ships no types, and the surface this file uses is
 * three members wide — cheaper to state than to take on `@types/jsdom` for one test.
 */
type FrameWindow = Record<string, unknown> & {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
};
type JsdomLike = { window: FrameWindow };
type JsdomOptions = { runScripts: 'dangerously'; pretendToBeVisual: boolean; beforeParse(win: FrameWindow): void };
// @ts-expect-error - jsdom ships no type declarations and this repo does not install them.
const { JSDOM } = (await import('jsdom')) as { JSDOM: new (html: string, options: JsdomOptions) => JsdomLike };

/*
 * The bridge ships as a source string injected into an opaque-origin game document, so
 * it is the one part of the player that no type-checker and no import graph can reach.
 * These tests run the document `embedGameHtml` actually produces, in a JSDOM that
 * executes scripts the way a browser does, and read what it posts.
 *
 * What it reports is the game's own account of its controls — the input the How-to-play
 * card trusts first. If the scraper silently stops finding rows, the card quietly falls
 * back to a catalog string that is English-only and absent on a deep link, and nothing
 * else in the suite would notice.
 */

type Posted = { type?: string; rows?: unknown; kit?: unknown; hint?: unknown };

let dom: JsdomLike | null = null;

/**
 * Embeds a game-shaped document, runs it, and returns everything the bridge posted.
 *
 * The whole `embedGameHtml` output is handed to JSDOM rather than a script pulled out of
 * it, so the injection itself is under test too. `parent` is the same window here, so the
 * bridge's `parent.postMessage` lands on a listener inside it — the path a real frame
 * takes to reach the host.
 */
async function runBridge(bodyHtml: string, gameKit?: Record<string, unknown>): Promise<Posted[]> {
  const posted: Posted[] = [];
  dom = new JSDOM(embedGameHtml(`<html><head></head><body>${bodyHtml}</body></html>`), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // Both the stub and the listener have to exist before the bridge script runs: it
    // reads GameKit and posts its first report during its own initialization.
    beforeParse(win: FrameWindow) {
      if (gameKit) win.GameKit = gameKit;
      win.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.source === 'gdpl-player') posted.push(event.data as Posted);
      });
    },
  });
  // Wait for the report rather than for a duration: a fixed sleep passes alone and flakes
  // when the suite runs files in parallel. Every path through `sendControls` posts, even
  // when the document says nothing, so "no message yet" always means "not yet".
  for (let waited = 0; waited < 2000 && !posted.some((m) => m.type === 'controls'); waited += 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return posted;
}

function controlsFrom(posted: Posted[]): Posted | undefined {
  return posted.filter((message) => message.type === 'controls').at(-1);
}

afterEach(() => {
  dom?.window.close();
  dom = null;
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
    // Posted as keycaps, not as GameKit's internal key names: " " is whitespace the host
    // would collapse to nothing, losing the key and leaving an actionless row.
    expect(controls?.kit).toEqual([
      { keys: 'Space', action: 'Fire', touch: true },
      { keys: 'Shift / X', action: 'Throttle', touch: true },
      { keys: '', action: '', pad: 'full' },
    ]);
  });

  it('names arrows and modifiers as keycaps, and does not walk the prototype doing it', async () => {
    // The lookup is by key name, and key names come from game code — "constructor" must
    // resolve to itself, not to Object.prototype.constructor.
    const controls = controlsFrom(
      await runBridge('<canvas id="game"></canvas>', {
        controlsManifest: () => ({
          pad: false,
          look: false,
          steer: false,
          buttons: [
            { keys: ['arrowup', 'w'], label: 'Climb' },
            { keys: ['control'], label: 'Cut' },
            { keys: ['constructor'], label: 'Odd' },
          ],
          touch: false,
        }),
      }),
    );
    expect(controls?.kit).toEqual([
      { keys: 'Up / W', action: 'Climb', touch: true },
      { keys: 'Ctrl', action: 'Cut', touch: true },
      { keys: 'constructor', action: 'Odd', touch: true },
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

describe('the bridge pad fallback', () => {
  /*
   * The manifest is the better source, but it only exists in a snapshot rebuilt after
   * the games repo ships `controlsManifest`. Every published game today has a pad in the
   * DOM instead, so this is what makes touch describable now rather than after a re-bake.
   */
  const PAD = `
    <div class="gamekit-touch">
      <div class="gamekit-touch-pad"></div>
      <div class="gamekit-touch-buttons">
        <div class="gamekit-touch-btn">Fire</div>
        <div class="gamekit-touch-btn">Throttle</div>
      </div>
    </div>`;

  it('reads the built pad when GameKit cannot be asked', async () => {
    const controls = controlsFrom(await runBridge(PAD));
    expect(controls?.kit).toEqual([
      { keys: '', action: 'Fire', touch: true },
      { keys: '', action: 'Throttle', touch: true },
      { keys: '', action: '', pad: 'full' },
    ]);
  });

  it('prefers the manifest when there is one, since it also knows the keys', async () => {
    const controls = controlsFrom(
      await runBridge(PAD, {
        controlsManifest: () => ({
          pad: 'full',
          look: false,
          steer: 'origin',
          buttons: [{ keys: [' '], label: 'Fire' }],
          touch: true,
        }),
      }),
    );
    expect(controls?.kit).toEqual([
      { keys: 'Space', action: 'Fire', touch: true },
      { keys: '', action: '', pad: 'full' },
    ]);
  });

  it('falls back to the pad when GameKit is present but answers nothing', async () => {
    // An older snapshot: GameKit is there, `controlsManifest` is not.
    const controls = controlsFrom(await runBridge(PAD, { wantsTouchControls: () => true }));
    const kit = (controls?.kit ?? []) as Array<{ action: string }>;
    expect(kit.some((row) => row.action === 'Fire')).toBe(true);
  });

  it('does not let a button label reach Object.prototype', async () => {
    // Button labels are written by the game. Deduping them through a keyed object would
    // make "__proto__" a property assignment on the prototype rather than an entry.
    const controls = controlsFrom(
      await runBridge(`
        <div class="gamekit-touch-buttons">
          <div class="gamekit-touch-btn">__proto__</div>
          <div class="gamekit-touch-btn">constructor</div>
          <div class="gamekit-touch-btn">Fire</div>
        </div>`),
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((controls?.kit as Array<{ action: string }>).map((row) => row.action)).toEqual([
      '__proto__',
      'constructor',
      'Fire',
    ]);
  });

  it('reports no pad on a desktop, where GameKit builds none', async () => {
    expect(controlsFrom(await runBridge('<canvas id="game"></canvas>'))?.kit).toEqual([]);
  });
});

describe('embedded canvas sizing', () => {
  it('fits the logical canvas to the iframe without stretching its hit box', () => {
    const html = embedGameHtml('<html><head></head><body><canvas id="game"></canvas></body></html>');

    expect(html).toContain('flex:0 1 auto!important');
    expect(html).toContain(
      'width:min(var(--gdpl-embed-width),calc(var(--gdpl-embed-height) * var(--gdpl-canvas-ratio)))!important',
    );
    expect(html).toContain('aspect-ratio:var(--gdpl-canvas-ratio)!important');
  });
});
