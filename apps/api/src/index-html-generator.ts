/**
 * Generate game index.html body fragment from GAME.json howToPlay schema.
 *
 * Mirror of games-repo tools/lib/index-html.ts. Both implementations must produce
 * identical output for shared fixtures (contract test in
 * apps/api/src/__tests__/index-html-generator.test.ts).
 *
 * Invariants preserved (de-facto DOM contract):
 * - ids: game-title, game-desc, sound-toggle, game, game-status
 * - classes: wrap, game-controls, sound-toggle, legend, legend-card,
 *   legend-title, legend-keys, legend-close, hint, sr-only
 * - data-i18n-en/pl and data-i18n-aria-label-en/pl attributes
 * - canvas: id="game", width/height, tabindex="0", role="img", aria-label
 * - #game-status: class="sr-only", aria-live="polite"
 * - #sound-toggle: aria-pressed="false", bilingual "Sound: On" label
 */

export interface HowToPlay {
  controls?: Array<{
    keys: string | { en: string; pl: string };
    action: { en: string; pl: string };
  }>;
  goal: { en: string; pl: string };
  scoring?: { en: string; pl: string };
  mode?: { en: string; pl: string };
  hint: { en: string; pl: string };
}

export interface Canvas {
  width?: number;
  height?: number;
}

export interface GameManifest {
  title?: string;
  description?: { en: string; pl: string } | string;
  howToPlay?: HowToPlay;
  canvas?: Canvas;
  [key: string]: any;
}

export interface GameSpec {
  title: string;
  [key: string]: any;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  );
}

function buildLegendRows(howToPlay: HowToPlay | undefined): Array<{
  type: 'control' | 'reserved';
  keys: string | { en: string; pl: string };
  action: { en: string; pl: string };
  reserved?: 'goal' | 'scoring' | 'mode';
}> {
  const rows: any[] = [];
  const fixedKeys = ['M', 'Enter / R', 'Touch'];
  const coveredFixedKeys = new Set<string>();

  if (!howToPlay) return [];

  // Custom controls
  if (howToPlay.controls) {
    for (const control of howToPlay.controls) {
      rows.push({
        type: 'control',
        keys: control.keys,
        action: control.action,
      });

      // Track which fixed rows are covered by custom controls
      const keyStr = typeof control.keys === 'string' ? control.keys : '';
      if (keyStr) {
        if (keyStr.includes('M')) coveredFixedKeys.add('M');
        if (keyStr.includes('Enter') || keyStr.includes('R')) {
          coveredFixedKeys.add('Enter / R');
        }
        if (keyStr.includes('Touch')) coveredFixedKeys.add('Touch');
      }
    }
  }

  // Goal (required)
  if (howToPlay.goal) {
    rows.push({
      type: 'reserved',
      reserved: 'goal',
      keys: { en: 'Goal', pl: 'Cel' },
      action: howToPlay.goal,
    });
  }

  // Scoring (optional)
  if (howToPlay.scoring) {
    rows.push({
      type: 'reserved',
      reserved: 'scoring',
      keys: { en: 'Scoring', pl: 'Punkty' },
      action: howToPlay.scoring,
    });
  }

  // Mode (optional)
  if (howToPlay.mode) {
    rows.push({
      type: 'reserved',
      reserved: 'mode',
      keys: { en: 'Mode:', pl: 'Tryb:' },
      action: howToPlay.mode,
    });
  }

  // Fixed rows (if not already covered)
  if (!coveredFixedKeys.has('M')) {
    rows.push({
      type: 'control',
      keys: 'M',
      action: { en: 'Sound on/off', pl: 'Dźwięk wł./wył.' },
    });
  }

  if (!coveredFixedKeys.has('Enter / R')) {
    rows.push({
      type: 'control',
      keys: 'Enter / R',
      action: { en: 'Play again', pl: 'Zagraj ponownie' },
    });
  }

  if (!coveredFixedKeys.has('Touch')) {
    rows.push({
      type: 'control',
      keys: { en: 'Touch', pl: 'Dotyk' },
      action: {
        en: 'On-screen pad with Dig and Flag buttons; long-press a tile to flag it',
        pl: 'Pad ekranowy z przyciskami Dig i Flag; przytrzymaj pole, aby postawić flagę',
      },
    });
  }

  return rows;
}

function formatKey(
  keys: string | { en: string; pl: string },
  locale: 'en' | 'pl',
): string {
  if (typeof keys === 'string') {
    return keys;
  }
  return keys[locale];
}

function generateActionAttrs(action: { en: string; pl: string }): string {
  return ` data-i18n-en="${escapeHtml(action.en)}" data-i18n-pl="${escapeHtml(action.pl)}"`;
}

function generateKeysAttrs(keys: string | { en: string; pl: string }): string {
  if (typeof keys === 'string') {
    return '';
  }
  return ` data-i18n-en="${escapeHtml(keys.en)}" data-i18n-pl="${escapeHtml(keys.pl)}"`;
}

function generateLegend(howToPlay: HowToPlay | undefined, spec: GameSpec): string {
  if (!howToPlay) return '';

  const rows = buildLegendRows(howToPlay);
  if (rows.length === 0) return '';

  let legendHtml = `        <details class="legend">
      <summary data-i18n-en="Controls" data-i18n-pl="Sterowanie">Controls</summary>
      <div class="legend-card">
        <p class="legend-title" data-i18n-en="How to play" data-i18n-pl="Jak grać">How to play</p>
        <dl class="legend-keys">
`;

  for (const row of rows) {
    const keysStr = formatKey(row.keys, 'en');
    const keysAttrs = generateKeysAttrs(row.keys);
    const actionAttrs = generateActionAttrs(row.action);

    legendHtml += `          <dt${keysAttrs}>${escapeHtml(keysStr)}</dt>\n`;
    legendHtml += `          <dd${actionAttrs}>${escapeHtml(row.action.en)}</dd>\n`;
  }

  legendHtml += `        </dl>
        <p class="legend-close" data-i18n-en="Click or tap anywhere outside to close" data-i18n-pl="Kliknij lub dotknij obok, aby zamknąć">Click or tap anywhere outside to close</p>
      </div>
    </details>
`;

  return legendHtml;
}

/**
 * Generate index.html body fragment from game manifest and spec.
 *
 * The fragment is deterministic and stable for diffing. Output uses:
 * - 2-space indentation
 * - Fixed attribute order
 * - Normalized whitespace
 * - HTML-escaped values
 */
export function generateIndexHtml(manifest: GameManifest, spec: GameSpec): string {
  const title = spec.title || manifest.title || '';
  const descriptionObj = manifest.description;
  const descEn = descriptionObj && typeof descriptionObj === 'object'
    ? (descriptionObj.en || '')
    : (typeof descriptionObj === 'string' ? descriptionObj : '');
  const descPl = descriptionObj && typeof descriptionObj === 'object'
    ? (descriptionObj.pl || '')
    : (typeof descriptionObj === 'string' ? descriptionObj : '');
  const howToPlay = manifest.howToPlay;
  const canvas = manifest.canvas || {};
  const canvasWidth = canvas.width ?? 640;
  const canvasHeight = canvas.height ?? 400;
  const hint = howToPlay?.hint || { en: '', pl: '' };
  const ariaLabelEn = `${title} playfield`;
  const ariaLabelPl = `${title} — pole gry`;

  let html = '<div class="wrap">\n';
  html += `  <h1 id="game-title" data-i18n-en="${escapeHtml(title)}" data-i18n-pl="${escapeHtml(title)}">${escapeHtml(title)}</h1>\n`;
  html += `  <p id="game-desc" data-i18n-en="${escapeHtml(descEn)}" data-i18n-pl="${escapeHtml(descPl)}">${escapeHtml(descEn)}</p>\n`;
  html += '  <div class="game-controls">\n';
  html += '    <button id="sound-toggle" class="sound-toggle" type="button" aria-pressed="false" data-i18n-en="Sound: On" data-i18n-pl="Dźwięk: Wł.">Sound: On</button>\n';

  // Add legend if howToPlay is present
  if (howToPlay) {
    html += generateLegend(howToPlay, spec);
  }

  html += '  </div>\n';
  html += `  <canvas id="game" width="${canvasWidth}" height="${canvasHeight}" tabindex="0" role="img" aria-label="${escapeHtml(ariaLabelEn)}" data-i18n-aria-label-en="${escapeHtml(ariaLabelEn)}" data-i18n-aria-label-pl="${escapeHtml(ariaLabelPl)}"></canvas>\n`;
  html += `  <p class="hint" data-i18n-en="${escapeHtml(hint.en)}" data-i18n-pl="${escapeHtml(hint.pl)}">${escapeHtml(hint.en)}</p>\n`;
  html += '  <p id="game-status" class="sr-only" aria-live="polite"></p>\n';
  html += '</div>\n';

  return html;
}
