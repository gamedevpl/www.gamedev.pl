// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { VisitFunnel } from './healthApi.js';
import { ImageExportFunnelBlock } from './ImageExportFunnelBlock.js';

function render(imageExport: VisitFunnel['imageExport']): string {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<ImageExportFunnelBlock funnel={{ imageExport } as VisitFunnel} />));
  const text = container.textContent ?? '';
  act(() => root.unmount());
  return text;
}

describe('ImageExportFunnelBlock', () => {
  it('renders outcomes against prompted visits', () => {
    const text = render({ requested: 4, saved: 2, dismissed: 1, failed: 1, rejected: 2 });
    expect(text).toContain('Game photos');
    expect(text).toContain('50%');
    expect(text).toContain('download failed');
    expect(text).toContain('25%');
  });

  it('says so when nothing was asked, and hides for old payloads', () => {
    expect(render({ requested: 0, saved: 0, dismissed: 0, rejected: 0 })).toContain('No game asked');
    expect(render(undefined)).toBe('');
  });
});
