import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('StudioTransferProposalConfirm styles', () => {
  it('imports studio-panel.css', () => {
    const src = readFileSync(fileURLToPath(new URL('./StudioTransferProposalConfirm.tsx', import.meta.url)), 'utf8');
    expect(src).toContain("import './studio-panel.css'");
  });
});
