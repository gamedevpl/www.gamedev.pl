export interface CredentialFinding {
  kind: string;
  index: number;
}

const CREDENTIAL_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'openai-key', pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{32,}\b/g },
  { kind: 'github-token', pattern: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'github-token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  // Our own personal access tokens (docs/agent-access-tokens.md). Listed here for the
  // same reason as everyone else's: an agent that holds one while authoring a game is
  // exactly the situation where it ends up pasted into the output.
  { kind: 'gamedev-access-token', pattern: /\bgdpl_pat_[0-9a-f]{16}_[A-Za-z0-9_-]{43}\b/g },
  { kind: 'gamedev-oauth-access', pattern: /\bgdpl_oat_[0-9a-f]{16}_[A-Za-z0-9_-]{43}\b/g },
  { kind: 'gamedev-oauth-refresh', pattern: /\bgdpl_ort_[0-9a-f]{16}_[A-Za-z0-9_-]{43}\b/g },
  // Creator-wide MCP opener (BY-27a). Wire form is base64url of `c1.…`; "c1." is a
  // complete 3-byte chunk so every such key's encoding starts with `YzEu`.
  { kind: 'gamedev-creator-agent-key', pattern: /\bYzEu[A-Za-z0-9_-]{80,}\b/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'pem-private-key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
];

export function findCredentialLikeStrings(text: string): CredentialFinding[] {
  const findings: CredentialFinding[] = [];

  for (const { kind, pattern } of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      findings.push({ kind, index: match.index });
      match = pattern.exec(text);
    }
  }

  return findings.sort((a, b) => a.index - b.index);
}
