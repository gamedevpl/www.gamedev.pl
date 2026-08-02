/**
 * Connect payload for a self-build round (BY-03 / BY-23).
 *
 * The Studio asks once for everything a creator needs to paste into their own coding
 * agent: per-client MCP install snippets (endpoint URL only — never a credential) and a
 * kickoff prompt that carries this game's durable opener key. Snippet templates live here
 * so docs and UI render from one source of truth. Regenerating the prompt remints a key
 * with a fresh signed `exp` at the same keyGeneration — it does NOT rotate. Pending
 * creator inbox lines ride along under "also apply:".
 */

import { mintGameAgentKey, verifyGameAgentKey } from './agent-game-key.js';

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
  /** Current keyGeneration — display/rotate UI; not a secret. */
  keyGeneration: number;
  /** True when this kickoff is the same durable key the creator already pasted (BY-20 handoff). */
  sameKeyAsBefore?: boolean;
}

export interface BuildInstallSnippetsInput {
  /** Absolute origin, e.g. `https://www.gamedev.pl`. */
  appBaseUrl: string;
}

export interface BuildKickoffPromptInput {
  title: string;
  /** Durable per-game opener key (embedded only in the kickoff, never in install). */
  gameKey: string;
  /** Undelivered creator inbox lines, oldest first. */
  pendingMessages?: readonly { text: string }[];
  /**
   * When true, append a line that nothing new needs pasting unless the creator rotated
   * (post-publish improve handoff — BY-20 + BY-23).
   */
  sameKeyReminder?: boolean;
}

export interface MintConnectPayloadInput {
  slug: string;
  ownerUid: string;
  keyGeneration: number;
  title: string;
  submissionTokenSecret: string;
  appBaseUrl: string;
  pendingMessages?: readonly { text: string }[];
  sameKeyReminder?: boolean;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
}

/** Join origin + `/api/mcp`, trimming a trailing slash on the origin. */
export function mcpEndpointUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}${MCP_ENDPOINT_PATH}`;
}

/**
 * Per-client install snippets. Every snippet configures the MCP endpoint URL and
 * nothing else — the game key rides the kickoff prompt, not the install.
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
 * the session loop (start returns the workflow; gate green ends the round — the game key
 * stays valid for the next round unless rotated), and any queued creator feedback as a
 * short "also apply:" list so a regenerate never drops them.
 *
 * User-facing copy says "key", never "token".
 */
export function buildKickoffPrompt(input: BuildKickoffPromptInput): string {
  const title = input.title.trim() || 'your game';
  const lines = [
    `Build "${title}" for gamedev.pl.`,
    `Start with the gamedevpl tool, key: ${input.gameKey}`,
    'start returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
  ];
  if (input.sameKeyReminder) {
    lines.push('Same key as before — nothing new to copy unless the creator rotated it.');
  }
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
 * Mint a durable per-game opener and assemble the connect payload. `expiresAt` is taken
 * from the key's verified `exp` claim so the UI's "expires" line cannot disagree with auth.
 */
export function mintConnectPayload(input: MintConnectPayloadInput): ConnectPayload {
  const gameKey = mintGameAgentKey(input.submissionTokenSecret, {
    slug: input.slug,
    creatorUid: input.ownerUid,
    keyGeneration: input.keyGeneration,
    now: input.now,
  });
  const claims = verifyGameAgentKey(gameKey, input.submissionTokenSecret);
  return {
    installSnippets: buildInstallSnippets({ appBaseUrl: input.appBaseUrl }),
    kickoffPrompt: buildKickoffPrompt({
      title: input.title,
      gameKey,
      pendingMessages: input.pendingMessages,
      sameKeyReminder: input.sameKeyReminder,
    }),
    expiresAt: claims.exp,
    keyGeneration: claims.keyGeneration,
    sameKeyAsBefore: input.sameKeyReminder,
  };
}
