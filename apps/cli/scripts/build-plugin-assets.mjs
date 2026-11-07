import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const repo = new URL('../../', root);
const skill = readFileSync(new URL('listings/mcp/claude-plugin/skills/gamedevpl/SKILL.md', repo), 'utf8');
const logo = readFileSync(new URL('apps/web/public/icons/icon-512.png', repo)).toString('base64');
const bridge = readFileSync(new URL('src/plugin-bridge.mjs', root), 'utf8');
mkdirSync(new URL('src/generated/', root), { recursive: true });
writeFileSync(
  fileURLToPath(new URL('src/generated/plugin-assets.json', root)),
  JSON.stringify({ skill, logo, bridge }),
);
