/**
 * Credential-free one-click MCP install deep links (BY-18c).
 *
 * Deep links carry the SERVER URL only. Auth happens afterwards via OAuth
 * discovery (RFC 9728 protected-resource metadata) or a header the creator
 * pastes themselves. A one-click install link must never carry a credential.
 */

/** Stable server name shared by Cursor / VS Code install payloads. */
export const MCP_INSTALL_SERVER_NAME = 'gamedevpl';

export interface McpInstallLinks {
  /** DOCUMENTED: https://cursor.com/docs/mcp/install-links */
  cursor: string;
  /** DOCUMENTED: https://code.visualstudio.com/api/extension-guides/ai/mcp */
  vscode: string;
}

/**
 * Markers that must never appear in a generated deep link (or its decoded config).
 * Written as a loud regression gate: adding a credential to the payload fails these.
 */
export const MCP_INSTALL_LINK_CREDENTIAL_MARKERS = [
  'Authorization',
  'Bearer',
  'headers',
  '"auth"',
  'c1.',
  'YzEu',
  'gdpl_oat_',
  'gdpl_ort_',
  'api_key',
  'apiKey',
  'client_secret',
  'CLIENT_SECRET',
] as const;

/** Cursor install config — name is a query param, not inside the JSON. */
export function buildCursorInstallConfig(mcpUrl: string): { url: string } {
  return { url: mcpUrl };
}

/** VS Code install config — name lives inside the JSON object. */
export function buildVscodeInstallConfig(mcpUrl: string): {
  name: string;
  type: 'http';
  url: string;
} {
  return {
    name: MCP_INSTALL_SERVER_NAME,
    type: 'http',
    url: mcpUrl,
  };
}

/**
 * `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64>`.
 * Config is standard base64 of the transport JSON (no name field), per Cursor docs.
 */
export function buildCursorInstallLink(mcpUrl: string): string {
  const configJson = JSON.stringify(buildCursorInstallConfig(mcpUrl));
  const configB64 = Buffer.from(configJson, 'utf8').toString('base64');
  return (
    'cursor://anysphere.cursor-deeplink/mcp/install' +
    `?name=${encodeURIComponent(MCP_INSTALL_SERVER_NAME)}` +
    `&config=${configB64}`
  );
}

/**
 * `vscode:mcp/install?<url-encoded JSON>`.
 * Payload includes name + type:"http" + url — no headers / secrets.
 */
export function buildVscodeInstallLink(mcpUrl: string): string {
  const configJson = JSON.stringify(buildVscodeInstallConfig(mcpUrl));
  return `vscode:mcp/install?${encodeURIComponent(configJson)}`;
}

export function buildMcpInstallLinks(mcpUrl: string): McpInstallLinks {
  return {
    cursor: buildCursorInstallLink(mcpUrl),
    vscode: buildVscodeInstallLink(mcpUrl),
  };
}

/** Decode the Cursor `config` query value back to JSON text (for tests / validation). */
export function decodeCursorInstallConfig(link: string): unknown {
  const url = new URL(link);
  const configB64 = url.searchParams.get('config');
  if (!configB64) throw new Error('cursor install link missing config');
  return JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));
}

/** Decode the VS Code install query back to JSON (for tests / validation). */
export function decodeVscodeInstallConfig(link: string): unknown {
  const prefix = 'vscode:mcp/install?';
  if (!link.startsWith(prefix)) throw new Error('not a vscode mcp install link');
  return JSON.parse(decodeURIComponent(link.slice(prefix.length)));
}

/**
 * Throws if any deep link (or its decoded config) contains credential material.
 * Used by unit tests; also callable from any future generator so the rule stays one place.
 */
export function assertInstallLinksHaveNoCredentials(links: McpInstallLinks): void {
  const decoded = [
    JSON.stringify(decodeCursorInstallConfig(links.cursor)),
    JSON.stringify(decodeVscodeInstallConfig(links.vscode)),
    links.cursor,
    links.vscode,
  ];
  for (const haystack of decoded) {
    for (const marker of MCP_INSTALL_LINK_CREDENTIAL_MARKERS) {
      if (haystack.includes(marker)) {
        throw new Error(`install link must not contain credential marker ${JSON.stringify(marker)}`);
      }
    }
  }
}
