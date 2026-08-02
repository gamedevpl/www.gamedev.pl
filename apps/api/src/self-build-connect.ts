/**
 * Connect payload for a self-build round (BY-03).
 *
 * The Studio asks once for everything a creator needs to paste into their own coding
 * agent: per-client MCP install snippets (endpoint URL only — never a credential) and a
 * kickoff prompt that carries this round's key. Snippet templates live here so docs and
 * UI render from one source of truth; regenerating the prompt mints a fresh key with a
 * new signed `exp`, and any pending creator inbox lines ride along under "also apply:".
 */

import { mintAgentToken, verifyAgentToken } from './agent-token.js';

/** Path of the remote MCP endpoint (served by BY-05). Install snippets point here. */
export const MCP_ENDPOINT_PATH = '/api/mcp';

export interface InstallSnippets {
  claudeCode: string;
  codex: string;
  cursor: string;
  kimi: string;
  cli: string;
}

export interface ConnectPayload {
  installSnippets: InstallSnippets;
  kickoffPrompt: string;
  /**
   * Unix seconds. Identical to the minted key's signed `exp` claim — not a separate
   * display clock the UI could drift from.
   */
  expiresAt: number;
}

export interface BuildInstallSnippetsInput {
  /** Absolute origin, e.g. `https://www.gamedev.pl`. */
  appBaseUrl: string;
}

export interface BuildKickoffPromptInput {
  title: string;
  /** Round-scoped build-channel key (embedded only in the kickoff, never in install). */
  roundKey: string;
  /** Undelivered creator inbox lines, oldest first. */
  pendingMessages?: readonly { text: string }[];
}

export interface MintConnectPayloadInput {
  jobId: number;
  title: string;
  roundGeneration: number;
  submissionTokenSecret: string;
  appBaseUrl: string;
  pendingMessages?: readonly { text: string }[];
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
}

/** Join origin + `/api/mcp`, trimming a trailing slash on the origin. */
export function mcpEndpointUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}${MCP_ENDPOINT_PATH}`;
}

/**
 * Per-client install snippets. Every snippet configures the MCP endpoint URL and
 * nothing else — the round key rides the kickoff prompt, not the install.
 */
export function buildInstallSnippets(input: BuildInstallSnippetsInput): InstallSnippets {
  const url = mcpEndpointUrl(input.appBaseUrl);
  return {
    claudeCode: `claude mcp add --transport http gamedevpl ${url}`,
    codex: [`[mcp_servers.gamedevpl]`, `url = "${url}"`].join('\n'),
    cursor: JSON.stringify(
      {
        mcpServers: {
          gamedevpl: {
            url,
          },
        },
      },
      null,
      2,
    ),
    // Kimi Code has no first-class remote-HTTP add yet; mcp-remote is the documented
    // stdio bridge (third-party — we publish no package). Same URL, still no key.
    kimi: `npx -y mcp-remote ${url}`,
    // Floor for agents that talk HTTP without an MCP client.
    cli: `curl -sS -X POST ${url}`,
  };
}

/**
 * Paste-ready kickoff: build instruction + gamedevpl tool key line + one line pointing at
 * the session loop (start returns the workflow; gate green is done; the key retires with the
 * round), and any queued creator feedback as a short "also apply:" list so a regenerate never
 * drops them. The base paste stays ≤ 5 lines with the key line intact at line 2.
 *
 * User-facing copy says "key", never "token".
 */
export function buildKickoffPrompt(input: BuildKickoffPromptInput): string {
  const title = input.title.trim() || 'your game';
  const lines = [
    `Build "${title}" for gamedev.pl.`,
    `Start with the gamedevpl tool, key: ${input.roundKey}`,
    'start returns your workflow; after gate green you are done — this key retires with the round.',
  ];
  const pending = (input.pendingMessages ?? []).map((message) => message.text.trim()).filter((text) => text.length > 0);
  if (pending.length > 0) {
    lines.push('');
    lines.push('also apply:');
    for (const text of pending) {
      // One bullet per message; collapse internal newlines so the paste stays scannable.
      lines.push(`- ${text.replace(/\s+/g, ' ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Mint a round-scoped key and assemble the connect payload. `expiresAt` is taken from
 * the key's verified `exp` claim so the UI's "expires" line cannot disagree with auth.
 */
export function mintConnectPayload(input: MintConnectPayloadInput): ConnectPayload {
  const roundKey = mintAgentToken(input.jobId, input.submissionTokenSecret, {
    roundGeneration: input.roundGeneration,
    now: input.now,
  });
  const claims = verifyAgentToken(roundKey, input.submissionTokenSecret);
  if (claims.exp === undefined) {
    // Round-scoped mint always sets exp; a missing claim would mean mint/verify drifted.
    throw new Error('minted connect key is missing exp claim');
  }
  return {
    installSnippets: buildInstallSnippets({ appBaseUrl: input.appBaseUrl }),
    kickoffPrompt: buildKickoffPrompt({
      title: input.title,
      roundKey,
      pendingMessages: input.pendingMessages,
    }),
    expiresAt: claims.exp,
  };
}
