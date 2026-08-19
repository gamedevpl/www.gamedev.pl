// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreationLimitsPanel } from './CreationLimitsPanel.js';
import type { CreationLimits } from './adminApi.js';

const mocked = vi.hoisted(() => ({
  fetchAdminSummary: vi.fn(),
  fetchCreationLimits: vi.fn(),
  setCreationLimits: vi.fn(),
  fetchPublicPlay: vi.fn(),
  setPublicPlaySlugs: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchAccessTokens: vi.fn(),
  mintAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);

function limits(overrides: Partial<CreationLimits> = {}): CreationLimits {
  return {
    stored: null,
    effective: {
      paused: false,
      globalDailySubmissionCap: 50,
      managedBuilderMode: 'auto',
      managedDailyCap: null,
      managedDailyUserCap: null,
      hasPlatformBackend: true,
      managedAgentVendor: {
        stored: null,
        effective: 'anthropic',
        available: true,
        configuredVendors: ['anthropic'],
        defaultVendor: 'anthropic',
      },
      tabCompletePaused: false,
      globalDailyTabCompleteTokenCap: 2_000_000,
      seedingMode: 'auto',
      seedProvider: {
        stored: null,
        effective: 'vertex',
        available: true,
        configuredProviders: ['vertex'],
        defaultProvider: 'vertex',
      },
    },
    today: { dateStr: '2026-07-30', submissions: 12, managedBuilds: 3, tabCompleteTokens: 0 },
    propagationMs: 60_000,
    ...overrides,
  };
}

async function render() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.fetchPublicPlay.mockResolvedValue({
    stored: null,
    effective: { slugs: [] },
    propagationMs: 60_000,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CreationLimitsPanel, {}));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === label);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('CreationLimitsPanel', () => {
  it('reports what is in force, not what happens to be stored', async () => {
    // Nothing stored still means a ceiling: the deployed default. An operator deciding
    // whether to pause needs the number actually being enforced.
    mocked.fetchCreationLimits.mockResolvedValue(limits());

    const { container, root } = await render();

    expect(container.querySelector('.health-summary')?.textContent).toContain('12 of 50 used today');
    expect(container.querySelector('.health-note')?.textContent).toContain('Nothing stored');

    await act(async () => root.unmount());
  });

  it('pauses creation and reports when the change is everywhere', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(limits());
    mocked.setCreationLimits.mockResolvedValue(
      limits({
        stored: { paused: true },
        effective: {
          paused: true,
          globalDailySubmissionCap: 50,
          managedBuilderMode: 'auto',
          managedDailyCap: null,
          managedDailyUserCap: null,
          hasPlatformBackend: true,
          managedAgentVendor: {
            stored: null,
            effective: 'anthropic',
            available: true,
            configuredVendors: ['anthropic'],
            defaultVendor: 'anthropic',
          },
          tabCompletePaused: false,
          globalDailyTabCompleteTokenCap: 2_000_000,
          seedingMode: 'auto',
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: true,
            configuredProviders: ['vertex'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );

    const { container, root } = await render();
    await act(async () => {
      button(container, 'Pause creation').click();
    });

    expect(mocked.setCreationLimits).toHaveBeenCalledWith({ paused: true });
    expect(container.querySelector('.health-summary')?.textContent).toContain('Creation is paused');
    // The button flips to the way out, so an incident does not end with a paused site
    // and no visible way to unpause it.
    expect(button(container, 'Resume creation')).toBeTruthy();
    expect(container.querySelector('.admin-limits-message')?.textContent).toContain('within 60s');

    await act(async () => root.unmount());
  });

  it('clears a stored ceiling rather than freezing today’s number into it', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(limits({ stored: { globalDailySubmissionCap: 20 } }));
    mocked.setCreationLimits.mockResolvedValue(limits());

    const { container, root } = await render();
    await act(async () => {
      button(container, 'Use the deployed default').click();
    });

    expect(mocked.setCreationLimits).toHaveBeenCalledWith({ globalDailySubmissionCap: null });

    await act(async () => root.unmount());
  });

  it('flips the managed vendor at runtime and reports the effective one', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(
      limits({
        effective: {
          paused: false,
          globalDailySubmissionCap: 50,
          managedBuilderMode: 'auto',
          managedDailyCap: null,
          managedDailyUserCap: null,
          hasPlatformBackend: true,
          managedAgentVendor: {
            stored: null,
            effective: 'anthropic',
            available: true,
            configuredVendors: ['anthropic', 'gemini'],
            defaultVendor: 'anthropic',
          },
          tabCompletePaused: false,
          globalDailyTabCompleteTokenCap: 2_000_000,
          seedingMode: 'auto',
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: true,
            configuredProviders: ['vertex'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );
    mocked.setCreationLimits.mockResolvedValue(
      limits({
        effective: {
          paused: false,
          globalDailySubmissionCap: 50,
          managedBuilderMode: 'auto',
          managedDailyCap: null,
          managedDailyUserCap: null,
          hasPlatformBackend: true,
          managedAgentVendor: {
            stored: 'gemini',
            effective: 'gemini',
            available: true,
            configuredVendors: ['anthropic', 'gemini'],
            defaultVendor: 'anthropic',
          },
          tabCompletePaused: false,
          globalDailyTabCompleteTokenCap: 2_000_000,
          seedingMode: 'auto',
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: true,
            configuredProviders: ['vertex'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );

    const { container, root } = await render();
    const vendorSelect = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('Vendor'))
      ?.querySelector('select');
    if (!vendorSelect) throw new Error('vendor select not found');

    await act(async () => {
      vendorSelect.value = 'gemini';
      vendorSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mocked.setCreationLimits).toHaveBeenCalledWith({ managedAgentVendorOverride: 'gemini' });
    expect(container.textContent).toContain('Overridden to gemini (no redeploy needed).');

    await act(async () => root.unmount());
  });

  it('reports a fallback when the stored override names an unconfigured vendor', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(
      limits({
        stored: { managedAgentVendorOverride: 'copilot' },
        effective: {
          paused: false,
          globalDailySubmissionCap: 50,
          managedBuilderMode: 'auto',
          managedDailyCap: null,
          managedDailyUserCap: null,
          hasPlatformBackend: true,
          managedAgentVendor: {
            stored: 'copilot',
            effective: 'anthropic',
            available: true,
            configuredVendors: ['anthropic'],
            defaultVendor: 'anthropic',
          },
          tabCompletePaused: false,
          globalDailyTabCompleteTokenCap: 2_000_000,
          seedingMode: 'auto',
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: true,
            configuredProviders: ['vertex'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );

    const { container, root } = await render();

    expect(container.textContent).toContain(
      'Overridden to copilot, but that vendor has no credentials in this environment — falling back to anthropic.',
    );

    await act(async () => root.unmount());
  });

  it('surfaces a refusal instead of pretending the change landed', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(limits());
    mocked.setCreationLimits.mockResolvedValue({ error: 'nothing to change' });

    const { container, root } = await render();
    await act(async () => {
      button(container, 'Pause creation').click();
    });

    expect(container.querySelector('.admin-limits-message')?.textContent).toBe('nothing to change');
    expect(container.querySelector('.health-summary')?.textContent).toContain('Creation is open');

    await act(async () => root.unmount());
  });

  it('turns round-0 seeding off from the console — the kill switch SEED_DISPATCH used to be', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(limits());
    mocked.setCreationLimits.mockResolvedValue(
      limits({ stored: { seedingMode: 'off' }, effective: { ...limits().effective, seedingMode: 'off' } }),
    );

    const { container, root } = await render();
    // Two "Mode" labels exist; scope to the seeding section.
    const seedingSection = Array.from(container.querySelectorAll('section')).find((section) =>
      section.textContent?.startsWith('Round-0 seeding'),
    );
    if (!seedingSection) throw new Error('seeding section not found');
    const modeSelect = Array.from(seedingSection.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('Mode'))
      ?.querySelector('select');
    if (!modeSelect) throw new Error('seeding mode select not found');

    await act(async () => {
      modeSelect.value = 'off';
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mocked.setCreationLimits).toHaveBeenCalledWith({ seedingMode: 'off' });
    expect(container.textContent).toContain('Off — every new game starts from an empty directory');

    await act(async () => root.unmount());
  });

  it('says auto is not actually operational when no provider is available', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(
      limits({
        effective: {
          ...limits().effective,
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: false,
            configuredProviders: [],
            defaultProvider: 'vertex',
          },
        },
      }),
    );

    const { container, root } = await render();

    expect(container.textContent).toContain('no provider is available here');
    expect(container.textContent).not.toContain('every new game gets a round-0 draft');

    await act(async () => root.unmount());
  });

  it('picks a seed provider from the console', async () => {
    mocked.fetchCreationLimits.mockResolvedValue(
      limits({
        effective: {
          ...limits().effective,
          seedProvider: {
            stored: null,
            effective: 'vertex',
            available: true,
            configuredProviders: ['vertex', 'anthropic'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );
    mocked.setCreationLimits.mockResolvedValue(
      limits({
        stored: { seedProviderOverride: 'anthropic' },
        effective: {
          ...limits().effective,
          seedProvider: {
            stored: 'anthropic',
            effective: 'anthropic',
            available: true,
            configuredProviders: ['vertex', 'anthropic'],
            defaultProvider: 'vertex',
          },
        },
      }),
    );

    const { container, root } = await render();
    const seedingSection = Array.from(container.querySelectorAll('section')).find((section) =>
      section.textContent?.startsWith('Round-0 seeding'),
    );
    if (!seedingSection) throw new Error('seeding section not found');
    const providerSelect = Array.from(seedingSection.querySelectorAll('label'))
      .find((label) => label.textContent?.startsWith('Provider'))
      ?.querySelector('select');
    if (!providerSelect) throw new Error('seed provider select not found');

    await act(async () => {
      providerSelect.value = 'anthropic';
      providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mocked.setCreationLimits).toHaveBeenCalledWith({ seedProviderOverride: 'anthropic' });
    expect(container.textContent).toContain('Overridden to anthropic (no redeploy needed).');

    await act(async () => root.unmount());
  });
});
