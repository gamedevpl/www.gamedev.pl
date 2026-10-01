// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildBar } from './StudioBuildBar.js';

const PROCESSING = 'v20260930T224758596Z-613108d9d61d';
const LIVE = 'v20260930T223014079Z-e07ba9772fd5';

function status(verdict: 'pending' | 'green' | 'red'): SubmissionStatus {
  return {
    status: 'building',
    recentBuilds: [{ version: PROCESSING, createdAt: '2026-09-30T22:47:58.000Z', mode: 'preview', verdict }],
  } as SubmissionStatus;
}

async function mount(props: { status: SubmissionStatus; liveVersion?: string | null }) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioBuildBar {...props} />);
  });
  return host;
}

describe('StudioBuildBar tags', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('names the build in the gate and the different one still live on stage', async () => {
    const host = await mount({ status: status('pending'), liveVersion: LIVE });
    expect(host.querySelector('.studio-build-bar-tag.is-processing')?.textContent).toBe('#613108');
    expect(host.querySelector('.studio-build-bar-tag.is-live')?.textContent).toBe('Live: #e07ba9');
    // Screen readers hear the tags too, not just the action.
    const name = host.querySelector('.studio-build-bar')?.getAttribute('aria-label') ?? '';
    expect(name).toContain('Open build progress');
    expect(name).toContain('#613108');
    expect(name).toContain('Live: #e07ba9');
  });

  it('shows one tag while the build in the gate is already the one on stage', async () => {
    const host = await mount({ status: status('pending'), liveVersion: PROCESSING });
    expect(host.querySelectorAll('.studio-build-bar-tag')).toHaveLength(1);
    expect(host.querySelector('.studio-build-bar-tag.is-processing')?.textContent).toBe('#613108');
  });

  it('drops the processing tag once the verdict is in and names the live build', async () => {
    const host = await mount({ status: status('green'), liveVersion: PROCESSING });
    expect(host.querySelector('.studio-build-bar-tag.is-processing')).toBeNull();
    expect(host.querySelector('.studio-build-bar-tag.is-live')?.textContent).toBe('#613108');
  });

  it('shows no live tag when the stage build is unknown', async () => {
    const host = await mount({ status: status('pending'), liveVersion: null });
    expect(host.querySelector('.studio-build-bar-tag.is-live')).toBeNull();
  });
});
