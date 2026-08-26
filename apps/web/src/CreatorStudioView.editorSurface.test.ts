import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./CreatorStudioView.tsx', import.meta.url)), 'utf8');

describe('Creator Studio editor surface posture', () => {
  it('passes the panel-selected mode to the explicit data attribute', () => {
    expect(source).toContain('data-surface={editorSurfaceMode}');
    expect(source).not.toMatch(/editorController\?\.status[^\n]+['"]full['"]/);
  });
});
