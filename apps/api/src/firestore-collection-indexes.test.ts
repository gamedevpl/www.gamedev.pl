import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const setupScript = readFileSync(resolve(repoRoot, 'infra/setup-gcp.sh'), 'utf8');

function provisionedCollectionComposites(script: string): Set<string> {
  const declaration = /COLLECTION_COMPOSITE_INDEXES="([^"]*)"/.exec(script);
  if (!declaration) throw new Error('COLLECTION_COMPOSITE_INDEXES not found in infra/setup-gcp.sh');
  return new Set(declaration[1].split(/\s+/).filter(Boolean));
}

describe('COLLECTION composite indexes', () => {
  it('provisions composites for the two-equality submission queries', () => {
    const provisioned = provisionedCollectionComposites(setupScript);
    expect([...provisioned].sort()).toEqual([
      'submissions:openRound:ASCENDING+ownerUid:ASCENDING',
      'submissions:ownerUid:ASCENDING+slug:ASCENDING',
    ]);
  });
});
