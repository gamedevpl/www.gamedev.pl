// Lockstep twin: games-repo index-html.ts

// Contract and goldens: docs/how-to-play-plan.md

import type { Locale } from '@gamedevpl/contract';
import { hasPlayableHowToPlay, type HowToPlay } from '../platform/how-to-play.js';

export type { HowToPlay };
export { hasPlayableHowToPlay };

export interface Canvas {
  width?: number;
  height?: number;
  ariaLabel?: { en: string; pl: string };
}

// Index signature carries engine/audio, so a parsed manifest passes straight in.
export interface GameManifest {
  title?: { en: string; pl: string } | string;
  description?: { en: string; pl: string } | string;
  howToPlay?: HowToPlay;
  canvas?: Canvas;
  [key: string]: unknown;
}

export interface GameSpec {
  title: string;
  [key: string]: unknown;
}

interface LegendRow {
  type: 'control' | 'reserved';
  keys: string | { en: string; pl: string };
  action: { en: string; pl: string };
  reserved?: 'goal' | 'scoring' | 'mode';
}

// Unescaped below — anything but a finite number is an injection vector.
function toCanvasDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  );
}

// Fixed rows: sound/playAgain/touch fields decide, not a control's keys.
function buildLegendRows(howToPlay: HowToPlay | undefined): LegendRow[] {
  const rows: LegendRow[] = [];

  if (!howToPlay) return [];

  if (howToPlay.controls) {
    for (const control of howToPlay.controls) {
      rows.push({
        type: 'control',
        keys: control.keys,
        action: control.action,
      });
    }
  }

  if (howToPlay.goal) {
    rows.push({
      type: 'reserved',
      reserved: 'goal',
      keys: { en: 'Goal', pl: 'Cel' },
      action: howToPlay.goal,
    });
  }

  if (howToPlay.scoring) {
    rows.push({
      type: 'reserved',
      reserved: 'scoring',
      keys: { en: 'Scoring', pl: 'Punkty' },
      action: howToPlay.scoring,
    });
  }

  if (howToPlay.mode) {
    rows.push({
      type: 'reserved',
      reserved: 'mode',
      keys: { en: 'Mode:', pl: 'Tryb:' },
      action: howToPlay.mode,
    });
  }

  if (howToPlay.sound !== false) {
    rows.push({
      type: 'control',
      keys: 'M',
      action: howToPlay.sound || { en: 'Sound on/off', pl: 'Dźwięk wł./wył.' },
    });
  }

  if (howToPlay.playAgain !== false) {
    rows.push({
      type: 'control',
      keys: 'Enter / R',
      action: howToPlay.playAgain || { en: 'Play again', pl: 'Zagraj ponownie' },
    });
  }

  if (howToPlay.touch !== false) {
    rows.push({
      type: 'control',
      keys: { en: 'Touch', pl: 'Dotyk' },
      action: howToPlay.touch || {
        en: 'On-screen pad on touch screens',
        pl: 'Pad ekranowy na ekranach dotykowych',
      },
    });
  }

  return rows;
}

function formatKey(keys: string | { en: string; pl: string }, locale: Locale): string {
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

function generateLegend(howToPlay: HowToPlay | undefined): string {
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

// Deterministic and diff-stable: fixed indentation, attribute order, escaping.
export function generateIndexHtml(manifest: GameManifest, spec: GameSpec): string {
  const titleObj = manifest.title;
  const titleEn = (titleObj && typeof titleObj === 'object' ? titleObj.en : titleObj) || spec.title || '';
  const titlePl = (titleObj && typeof titleObj === 'object' ? titleObj.pl : undefined) || titleEn;
  const title = titleEn;
  const descriptionObj = manifest.description;
  const descEn =
    descriptionObj && typeof descriptionObj === 'object'
      ? descriptionObj.en || ''
      : typeof descriptionObj === 'string'
        ? descriptionObj
        : '';
  const descPl =
    descriptionObj && typeof descriptionObj === 'object'
      ? descriptionObj.pl || ''
      : typeof descriptionObj === 'string'
        ? descriptionObj
        : '';
  const howToPlay = manifest.howToPlay;
  const canvas = manifest.canvas || {};
  const canvasWidth = toCanvasDimension(canvas.width, 640);
  const canvasHeight = toCanvasDimension(canvas.height, 400);
  const hint = howToPlay?.hint || { en: '', pl: '' };
  const ariaLabelEn = canvas.ariaLabel?.en ?? `${title} playfield`;
  const ariaLabelPl = canvas.ariaLabel?.pl ?? `${title} — pole gry`;

  let html = '<div class="wrap">\n';
  html += `  <h1 id="game-title" data-i18n-en="${escapeHtml(titleEn)}" data-i18n-pl="${escapeHtml(titlePl)}">${escapeHtml(titleEn)}</h1>\n`;
  html += `  <p id="game-desc" data-i18n-en="${escapeHtml(descEn)}" data-i18n-pl="${escapeHtml(descPl)}">${escapeHtml(descEn)}</p>\n`;
  html += '  <div class="game-controls">\n';
  html +=
    '    <button id="sound-toggle" class="sound-toggle" type="button" aria-pressed="false" data-i18n-en="Sound: On" data-i18n-pl="Dźwięk: Wł.">Sound: On</button>\n';

  if (howToPlay) {
    html += generateLegend(howToPlay);
  }

  html += '  </div>\n';
  html += `  <canvas id="game" width="${canvasWidth}" height="${canvasHeight}" tabindex="0" role="img" aria-label="${escapeHtml(ariaLabelEn)}" data-i18n-aria-label-en="${escapeHtml(ariaLabelEn)}" data-i18n-aria-label-pl="${escapeHtml(ariaLabelPl)}"></canvas>\n`;
  html += `  <p class="hint" data-i18n-en="${escapeHtml(hint.en)}" data-i18n-pl="${escapeHtml(hint.pl)}">${escapeHtml(hint.en)}</p>\n`;
  html += '  <p id="game-status" class="sr-only" aria-live="polite"></p>\n';
  html += '</div>\n';

  return html;
}
