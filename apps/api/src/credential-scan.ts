export interface CredentialFinding {
  kind: string;
  index: number;
}

const CREDENTIAL_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'openai-key', pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{32,}\b/g },
  { kind: 'github-token', pattern: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'github-token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
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
