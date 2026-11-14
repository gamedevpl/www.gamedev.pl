import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const workflow = readFileSync(resolve(repoRoot, '.github/workflows/games-catalog-gate.yml'), 'utf8');

function extractStepBlock(stepName: string): string {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`- name: ${escaped}\\n([\\s\\S]*?)(?=\\n      - name:|\\n  [a-z-]+:|$)`).exec(workflow);
  if (!match) throw new Error(`Step not found: ${stepName}`);
  return match[1];
}

function extractStepRun(stepName: string): string {
  const block = extractStepBlock(stepName);
  const match = /run: \|\n([\s\S]*)$/.exec(block);
  if (!match) throw new Error(`Run block not found in step: ${stepName}`);
  return match[1];
}

describe('games-catalog-gate workflow', () => {
  it('exposes direct_slugs from resolve and emits it in Classify merge scope', () => {
    expect(workflow).toMatch(/^\s*direct_slugs:\s*\$\{\{\s*steps\.scope\.outputs\.direct_slugs\s*\}\}$/m);
    const scopeRun = extractStepRun('Classify merge scope');
    expect(scopeRun).toContain('echo "direct_slugs=$DIRECT_SLUGS"');
    expect(scopeRun).not.toContain('${{');
  });

  it('passes workflow expressions through env rather than interpolating into run blocks', () => {
    for (const stepName of ['Run the full games gate', 'Run the static games gate', 'Run the scoped games gate']) {
      const runBlock = extractStepRun(stepName);
      expect(runBlock, stepName).not.toContain('${{');
    }
  });

  it('collects static checks then skips browser stages on failure in static and scoped gates', () => {
    for (const stepName of ['Run the static games gate', 'Run the scoped games gate']) {
      const runBlock = extractStepRun(stepName);
      expect(runBlock, stepName).toContain('run_stage npm run check:no-js');
      expect(runBlock, stepName).toMatch(/run_stage npm run validate[^\n]*\n\s*if \[ "\$gate_failed" -eq 0 \]/);
      expect(runBlock, stepName).toMatch(/if \[ "\$gate_failed" -eq 0 \][^\n]*\n\s*run_stage npm run smoke -- \$SLUGS/);
    }
  });

  it('bounds push agent-play and playtest in mode=static while supporting -j 4', () => {
    const staticBlock = extractStepBlock('Run the static games gate');
    expect(staticBlock).toContain('CATALOG_AGENT_PLAY: ${{ needs.resolve.outputs.catalog_agent_play }}');
    expect(staticBlock).toContain('CATALOG_PLAYTEST: ${{ needs.resolve.outputs.catalog_playtest }}');
    expect(staticBlock).toContain('DIRECT_SLUGS: ${{ needs.resolve.outputs.direct_slugs }}');

    const staticRun = extractStepRun('Run the static games gate');
    expect(staticRun).toContain('if [ "$CATALOG_AGENT_PLAY" = 1 ]; then');
    expect(staticRun).toContain('elif [ -n "${DIRECT_SLUGS// /}" ]; then');
    expect(staticRun).toContain('run_stage npm run agent-play -- -j 2 $DIRECT_SLUGS');
    expect(staticRun).toContain("if grep -q 'takeConcurrencyFlag' tools/playtest.ts");
    expect(staticRun).toContain('playtest_j=(-j 4)');
    expect(staticRun).toContain('elif [ -n "${DIRECT_SLUGS// /}" ]; then');
    expect(staticRun).toContain('playtest_slugs="$DIRECT_SLUGS"');
    expect(staticRun).toContain('run_stage npm run playtest -- "${playtest_j[@]}" $playtest_slugs');
  });
});
