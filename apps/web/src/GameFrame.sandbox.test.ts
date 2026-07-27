// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { GameFrame } from './GameFrame.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Sandbox Invariant Security Guard', () => {
  it('renders GameFrame with strictly sandbox="allow-scripts"', () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(GameFrame, { title: 'Test Game', src: 'https://example.com/game' }));
    });

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('guarantees no source file in apps/web/src introduces allow-same-origin or dangerous sandbox permissions in code', () => {
    const srcDir = path.resolve(__dirname);
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];

    const codeFiles = files.filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'),
    );

    const forbiddenTokens = [
      'allow-same-origin',
      'allow-forms',
      'allow-popups',
      'allow-top-navigation',
      'allow-modals',
    ];

    for (const file of codeFiles) {
      const fullPath = path.join(srcDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Strip single-line and multi-line comments before checking code
      const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      for (const token of forbiddenTokens) {
        expect(
          codeWithoutComments.includes(token),
          `Security Invariant Violation: Found forbidden token "${token}" in non-comment code of ${file}`,
        ).toBe(false);
      }
    }
  });
});
