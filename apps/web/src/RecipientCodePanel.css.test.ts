import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

// Settings opens on routes that never load Studio's chunk.
describe('recipient code styles travel with the component', () => {
  it('owns its rules rather than borrowing the Studio stylesheet', () => {
    const css = read('./RecipientCodePanel.css');
    expect(css).toContain('.recipient-code-row');
    expect(css).toContain('.recipient-code-label');
  });

  it('is imported by the component that renders it', () => {
    expect(read('./RecipientCodePanel.tsx')).toContain("import './RecipientCodePanel.css'");
  });

  it('leaves no code-row rule behind in the Studio chunk', () => {
    expect(read('./surfaces/studio/studio-panel.css')).not.toContain('.studio-transfer-code');
  });
});
