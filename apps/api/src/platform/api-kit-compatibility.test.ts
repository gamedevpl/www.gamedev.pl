import { describe, expect, it } from 'vitest';
import { apiKitPlan, assertApiKitPlanUnchanged, sha256, validateApiKitEvidence } from './api-kit-compatibility.js';
import { apiKitContainerArgs, apiKitStarter } from './api-kit-input.js';
import { writeTarGz } from './tar.js';

const current = 'a'.repeat(40);
const previous = 'b'.repeat(40);
const older = 'c'.repeat(40);
const retired = 'd'.repeat(40);
const digest = 'e'.repeat(64);
const consumerSha = 'f'.repeat(40);
const registry = JSON.stringify({ current, previous, currentVersion: '1.11.2', updatedAt: 'today' });
const sidecar = (version: string, sha = digest) => JSON.stringify({ version, sha256: sha });
const sidecars = {
  [current]: sidecar('1.11.2'),
  [previous]: sidecar('0.9.0'),
  [older]: sidecar('1.0.0'),
  [retired]: sidecar('2.0.0'),
};

describe('API deployment compatibility window', () => {
  it('tests current, previous and every older Kit the API accepts', () => {
    expect(apiKitPlan(registry, sidecars).kits.map((kit) => kit.engineRef)).toEqual([current, previous, older]);
    expect(apiKitPlan(registry, Object.fromEntries(Object.entries(sidecars).reverse()))).toEqual(
      apiKitPlan(registry, sidecars),
    );
  });
  it('fails on a missing pinned sidecar or mutable ref', () => {
    expect(() => apiKitPlan(registry, { [current]: sidecars[current] })).toThrow(/sidecar/);
    expect(() => apiKitPlan(registry.replace(current, 'main'), sidecars)).toThrow(/immutable/);
  });
  it('does not broaden the window for malformed versions', () => {
    const plan = apiKitPlan(registry.replace('1.11.2', 'invalid'), sidecars);
    expect(plan.kits.map((kit) => kit.engineRef)).toEqual([current, previous]);
  });
  it('deduplicates historical same-major Kits by version keeping the latest', () => {
    const older1 = '1'.repeat(40);
    const older2 = '2'.repeat(40);
    const sidecarsWithDuplicates = {
      [current]: sidecar('1.11.2'),
      [previous]: sidecar('1.11.1'),
      [older1]: JSON.stringify({ version: '1.0.0', sha256: digest, packedAt: '2026-08-14T00:00:00Z' }),
      [older2]: JSON.stringify({ version: '1.0.0', sha256: digest, packedAt: '2026-08-15T00:00:00Z' }),
    };
    const plan = apiKitPlan(registry, sidecarsWithDuplicates);
    expect(plan.kits.map((k) => k.engineRef)).toEqual([older2, current, previous].sort());
  });
  it('rejects pointer changes, changed bytes and newly accepted older Kits', () => {
    const plan = apiKitPlan(registry, sidecars);
    for (const next of [
      apiKitPlan(registry.replace('today', 'tomorrow'), sidecars),
      apiKitPlan(registry, { ...sidecars, [older]: sidecar('1.0.0', '1'.repeat(64)) }),
      apiKitPlan(registry, { ...sidecars, ['2'.repeat(40)]: sidecar('1.1.0') }),
    ])
      expect(() => assertApiKitPlanUnchanged(plan, next)).toThrow(/retry deployment/);
  });
});

describe('executed artifact evidence', () => {
  const expected = { engineRef: current, sha256: digest, consumerSha, modes: ['ordinary-probe', 'hot-probe'] };
  const receipt = () => ({
    version: 1,
    engineRef: current,
    tarballSha256: digest,
    consumerSha,
    artifacts: expected.modes.map((slug) => ({ slug, engineRef: current, htmlSha256: digest, frames: 8 })),
  });
  it('accepts both executed boot modes and rejects stale identities and missing frames', () => {
    expect(() => validateApiKitEvidence(receipt(), expected)).not.toThrow();
    for (const broken of [
      { ...receipt(), consumerSha: previous },
      { ...receipt(), tarballSha256: '1'.repeat(64) },
      { ...receipt(), artifacts: [] },
      { ...receipt(), artifacts: [receipt().artifacts[0], receipt().artifacts[0]] },
      { ...receipt(), artifacts: receipt().artifacts.map((artifact) => ({ ...artifact, frames: 0 })) },
      { ...receipt(), artifacts: [null, null] },
    ])
      expect(() => validateApiKitEvidence(broken, expected)).toThrow();
  });
});

describe('published Kit input and isolation', () => {
  it('uses the actual checksum and Kit identity, and retains only starter files', async () => {
    const tarball = await writeTarGz([
      { path: 'gamedevpl-creator-kit/kit.json', content: Buffer.from(JSON.stringify({ engineRef: current })) },
      { path: 'gamedevpl-creator-kit/starters/block-cascade/GAME.json', content: Buffer.from('{}') },
      { path: 'gamedevpl-creator-kit/starters/block-cascade/game.ts', content: Buffer.from('game') },
      { path: 'gamedevpl-creator-kit/tools/unsafe.js', content: Buffer.from('throw 1') },
    ]);
    expect(Object.keys(await apiKitStarter(tarball, current, sha256(tarball)))).toHaveLength(2);
    await expect(apiKitStarter(tarball, current, digest)).rejects.toThrow(/sidecar/);
    await expect(apiKitStarter(tarball, previous, sha256(tarball))).rejects.toThrow(/identity/);
  });
  it('extracts legacy templates/game as starter files when starters directory is absent', async () => {
    const tarball = await writeTarGz([
      { path: 'gamedevpl-creator-kit/kit.json', content: Buffer.from(JSON.stringify({ engineRef: older })) },
      { path: 'gamedevpl-creator-kit/templates/game/GAME.json', content: Buffer.from('{}') },
      { path: 'gamedevpl-creator-kit/templates/game/game.ts', content: Buffer.from('game') },
      { path: 'gamedevpl-creator-kit/tools/unsafe.js', content: Buffer.from('throw 1') },
    ]);
    const extracted = await apiKitStarter(tarball, older, sha256(tarball));
    expect(Object.keys(extracted).sort()).toEqual([
      'starters/block-cascade/GAME.json',
      'starters/block-cascade/game.ts',
    ]);
  });
  it('gives candidate execution no network, host source, credentials or socket', () => {
    const args = apiKitContainerArgs(`sha256:${digest}`, '/input', '/output');
    expect(args).toEqual(
      expect.arrayContaining([
        '--network=none',
        '--read-only',
        '--user=10002:10002',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
      ]),
    );
    expect(args.filter((arg) => arg.startsWith('type=bind'))).toEqual([
      'type=bind,src=/input,dst=/input,readonly',
      'type=bind,src=/output,dst=/result',
    ]);
    expect(args).toContain('--env=HTTPS_PROXY=');
    expect(apiKitContainerArgs(`sha256:${digest}`, '/input', '/output', 'api-kit-verifier')).toContain(
      '--security-opt=apparmor=api-kit-verifier',
    );
    expect(() => apiKitContainerArgs('node:latest', '/input', '/output')).toThrow(/immutable/);
  });
});
