import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GameGenerator, GameProject } from './types.js';

type TemplateName = 'dodge' | 'collect' | 'space';

interface TemplateMatcher {
  name: TemplateName;
  keywords: string[];
  defaultTitle: string;
}

// Ordered by specificity: the first template with a keyword hit wins.
const TEMPLATES: TemplateMatcher[] = [
  { name: 'collect', keywords: ['collect', 'coin', 'gather', 'catch', 'pick'], defaultTitle: 'Coin Catcher' },
  {
    name: 'space',
    keywords: ['space', 'ship', 'rocket', 'asteroid', 'star', 'galaxy'],
    defaultTitle: 'Asteroid Drift',
  },
  { name: 'dodge', keywords: ['dodge', 'avoid', 'evade', 'survive', 'escape', 'run'], defaultTitle: 'Hazard Dodge' },
];

const DEFAULT_TEMPLATE = TEMPLATES[2]; // 'dodge'

function pickTemplate(prompt: string): TemplateMatcher {
  const text = prompt.toLowerCase();
  for (const template of TEMPLATES) {
    if (template.keywords.some((keyword) => text.includes(keyword))) {
      return template;
    }
  }
  return DEFAULT_TEMPLATE;
}

// Resolves relative to this module, so it works both compiled from dist/ and
// under vitest from src/ — in both cases '../templates' lands at
// packages/game-generator/templates.
function readTemplateFile(name: TemplateName, file: string): string {
  const path = fileURLToPath(new URL(`../templates/${name}/${file}`, import.meta.url));
  return readFileSync(path, 'utf8');
}

function deriveTitle(prompt: string, fallback: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return fallback;
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fill(source: string, title: string, description: string): string {
  return source.split('__TITLE__').join(title).split('__DESCRIPTION__').join(description);
}

/**
 * A deterministic, offline generator. It matches keywords in the prompt to a
 * hand-authored vanilla-JS canvas game template on disk and personalizes the
 * title/description placeholders. Requires no API key or network access, so the
 * full prompt -> game -> play loop runs locally out of the box.
 */
export class MockGameGenerator implements GameGenerator {
  readonly name = 'mock';

  async generate(prompt: string): Promise<GameProject> {
    const template = pickTemplate(prompt);
    const title = deriveTitle(prompt, template.defaultTitle);
    const description = prompt.trim()
      ? `Generated from your idea: "${prompt.trim()}"`
      : 'A little arcade game, generated for you.';

    const html = fill(readTemplateFile(template.name, 'index.html'), title, description);
    const js = fill(readTemplateFile(template.name, 'game.js'), title, description);
    const css = readTemplateFile(template.name, 'style.css');

    return { title, description, html, js, css };
  }
}
