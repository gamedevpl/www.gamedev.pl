import { describe, expect, it } from 'vitest';
import {
  assertInstallLinksHaveNoCredentials,
  buildCursorInstallConfig,
  buildCursorInstallLink,
  buildMcpInstallLinks,
  buildVscodeInstallConfig,
  buildVscodeInstallLink,
  decodeCursorInstallConfig,
  decodeVscodeInstallConfig,
  MCP_INSTALL_LINK_CREDENTIAL_MARKERS,
  MCP_INSTALL_SERVER_NAME,
} from './mcp-install-links.js';

const MCP_URL = 'https://www.gamedev.pl/api/mcp';

describe('mcp install deep links (BY-18c)', () => {
  it('builds a Cursor link whose decoded config is URL-only', () => {
    const link = buildCursorInstallLink(MCP_URL);
    expect(link.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?')).toBe(true);
    expect(link).toContain(`name=${MCP_INSTALL_SERVER_NAME}`);
    expect(decodeCursorInstallConfig(link)).toEqual(buildCursorInstallConfig(MCP_URL));
    expect(decodeCursorInstallConfig(link)).toEqual({ url: MCP_URL });
  });

  it('builds a VS Code link whose decoded config is URL-only', () => {
    const link = buildVscodeInstallLink(MCP_URL);
    expect(link.startsWith('vscode:mcp/install?')).toBe(true);
    expect(decodeVscodeInstallConfig(link)).toEqual(buildVscodeInstallConfig(MCP_URL));
    expect(decodeVscodeInstallConfig(link)).toEqual({
      name: MCP_INSTALL_SERVER_NAME,
      type: 'http',
      url: MCP_URL,
    });
  });

  it('REGRESSION: generated deep links never carry credential material', () => {
    const links = buildMcpInstallLinks(MCP_URL);
    // Loud failure if someone later embeds Authorization / headers / a key prefix.
    expect(() => assertInstallLinksHaveNoCredentials(links)).not.toThrow();

    for (const [client, link] of Object.entries(links)) {
      for (const marker of MCP_INSTALL_LINK_CREDENTIAL_MARKERS) {
        expect(link, `${client} link must not contain ${marker}`).not.toContain(marker);
      }
    }

    const cursorConfig = JSON.stringify(decodeCursorInstallConfig(links.cursor));
    const vscodeConfig = JSON.stringify(decodeVscodeInstallConfig(links.vscode));
    for (const marker of MCP_INSTALL_LINK_CREDENTIAL_MARKERS) {
      expect(cursorConfig, `cursor config must not contain ${marker}`).not.toContain(marker);
      expect(vscodeConfig, `vscode config must not contain ${marker}`).not.toContain(marker);
    }

    // Extra guard: a forged credential-bearing config would fail the assertion.
    const poisoned = {
      cursor: buildCursorInstallLink(MCP_URL).replace(
        Buffer.from(JSON.stringify({ url: MCP_URL }), 'utf8').toString('base64'),
        Buffer.from(JSON.stringify({ url: MCP_URL, headers: { Authorization: 'Bearer c1.secret' } }), 'utf8').toString(
          'base64',
        ),
      ),
      vscode: `vscode:mcp/install?${encodeURIComponent(
        JSON.stringify({
          name: MCP_INSTALL_SERVER_NAME,
          type: 'http',
          url: MCP_URL,
          headers: { Authorization: 'Bearer c1.secret' },
        }),
      )}`,
    };
    expect(() => assertInstallLinksHaveNoCredentials(poisoned)).toThrow(/credential marker/);
  });
});
