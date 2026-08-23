import { describe, expect, it } from 'vitest';
import { findCredentialLikeStrings } from './credential-scan.js';

describe('findCredentialLikeStrings', () => {
  it.each([
    {
      kind: 'anthropic-key',
      bundle: `const key = "sk-ant-${'A'.repeat(40)}";`,
      secret: `sk-ant-${'A'.repeat(40)}`,
    },
    { kind: 'openai-key', bundle: `const key = "sk-${'A'.repeat(40)}";`, secret: `sk-${'A'.repeat(40)}` },
    { kind: 'github-token', bundle: `const key = "ghp_${'A'.repeat(24)}";`, secret: `ghp_${'A'.repeat(24)}` },
    { kind: 'github-token', bundle: `const key = "gho_${'A'.repeat(24)}";`, secret: `gho_${'A'.repeat(24)}` },
    { kind: 'github-token', bundle: `const key = "ghs_${'A'.repeat(24)}";`, secret: `ghs_${'A'.repeat(24)}` },
    { kind: 'github-token', bundle: `const key = "ghu_${'A'.repeat(24)}";`, secret: `ghu_${'A'.repeat(24)}` },
    {
      kind: 'github-token',
      bundle: `const key = "github_pat_${'A'.repeat(30)}";`,
      secret: `github_pat_${'A'.repeat(30)}`,
    },
    {
      kind: 'google-api-key',
      bundle: `const key = "AIza${'A'.repeat(35)}";`,
      secret: `AIza${'A'.repeat(35)}`,
    },
    {
      kind: 'aws-access-key-id',
      bundle: `const key = "AKIA${'A'.repeat(16)}";`,
      secret: `AKIA${'A'.repeat(16)}`,
    },
    {
      kind: 'pem-private-key',
      bundle: '-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----',
      secret: '-----BEGIN RSA PRIVATE KEY-----',
    },
  ])('detects $kind', ({ kind, bundle, secret }) => {
    const findings = findCredentialLikeStrings(bundle);
    expect(findings).toEqual([{ kind, index: bundle.indexOf(secret) }]);
  });

  it('does not flag realistic generated game code snippets', () => {
    const realisticBundle = `
      const sprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAYAAABQvY9XAAABdElEQVR4nO3RsQ3CMBBF0YfS5wYw7wQvM7GQmQv4Nf0d7f8Y9hR5NnM7R4w";
      const color = "#1e90ff";
      const id = "550e8400-e29b-41d4-a716-446655440000";
      function tick(){for(let i=0;i<300;i++){window.__score=(window.__score??0)+i%7;}}
    `;
    expect(findCredentialLikeStrings(realisticBundle)).toEqual([]);
  });

  it('never returns the matched secret value in findings', () => {
    const secret = `sk-ant-${'A'.repeat(40)}`;
    const findings = findCredentialLikeStrings(`const key="${secret}";`);
    expect(findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('detects a creator-wide agent key (base64url of c1.…)', () => {
    const secret = Buffer.from(`c1.u.${'x'.repeat(20)}.1.9999999999.${'ab'.repeat(32)}`, 'utf8').toString('base64url');
    expect(secret.startsWith('YzEu')).toBe(true);
    const bundle = `const key = "${secret}";`;
    expect(findCredentialLikeStrings(bundle)).toEqual([
      { kind: 'gamedev-creator-agent-key', index: bundle.indexOf(secret) },
    ]);
  });
});
