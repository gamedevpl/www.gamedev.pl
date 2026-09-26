// The gate opens hostile generated games; its renderer must stay sandboxed.
export function chromiumSandbox(): { enabled: boolean; reason: string } {
  if (process.env.E2E_CHROMIUM_NO_SANDBOX === '1') return { enabled: false, reason: 'E2E_CHROMIUM_NO_SANDBOX=1' };
  if (process.getuid?.() !== 0) return { enabled: true, reason: '' };

  // Only the explicit opt-out may unsandbox the gate, never root.
  if (process.env.E2E_REQUIRED === '1') {
    throw new Error('E2E_REQUIRED=1 refuses to run Chromium as root unsandboxed; see docs/deployment.md');
  }
  return { enabled: false, reason: 'running as root, where Chromium cannot sandbox' };
}
