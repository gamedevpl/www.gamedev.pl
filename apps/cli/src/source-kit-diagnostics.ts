import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceProject } from './source-project.js';

function ref(path: string): string | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8')).engineRef;
    return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

export function sourceKitWarnings(root: string): string[] {
  if (!sourceProject(root)) return [];
  const pinned = ref(join(root, 'gamedev-kit.json'))!;
  const copies = [
    ['node_modules/@gamedevpl/gamekit', join(root, 'node_modules/@gamedevpl/gamekit/kit.json')],
    ['.gamedev/local', join(root, '.gamedev/local/kit.json')],
    [
      '.gamedev/local/node_modules/@gamedevpl/gamekit',
      join(root, '.gamedev/local/node_modules/@gamedevpl/gamekit/kit.json'),
    ],
  ];
  return copies.flatMap(([label, path]) => {
    const installed = ref(path);
    return installed && installed !== pinned
      ? [
          `Warning: ${label} uses GameKit ${installed}, but gamedev-kit.json pins ${pinned}. Play and verification use .gamedev/local; check the repository's Kit setup and dependencies.`,
        ]
      : [];
  });
}

export function sourceKitBuildDiagnostic(root: string, detail: string): string {
  if (!detail.includes('Unknown GameKit module:')) return detail;
  try {
    if (!sourceProject(root)) return detail;
  } catch {
    return detail;
  }
  const pinned = ref(join(root, 'gamedev-kit.json'));
  return `${detail}\nThis repository pins GameKit ${pinned} in gamedev-kit.json. Check the module name and the pinned Kit version; to use a newer Kit, update the repository pin and run npm run setup.`;
}
