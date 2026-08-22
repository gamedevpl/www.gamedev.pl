/**
 * Connect payload for a self-build round (BY-03 / BY-27b).
 *
 * The Studio asks once for everything a creator needs: a config block (MCP URL +
 * Authorization header for the creator-wide key) and a keyless kickoff prompt that
 * carries only the game slug. The secret never appears at full length in rendered
 * markup — callers get a masked header for display and the real value for Copy.
 *
 * Pending creator inbox lines ride along under "also apply:".
 */

import {
  creatorAgentKeyFingerprint,
  maskCreatorAgentKeyHeader,
  mintCreatorAgentKey,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import type { InstallSnippets } from '@gamedevpl/contract';
import { mintGameAgentKey, verifyGameAgentKey } from './agent-game-key.js';
import { buildMcpInstallLinks, type McpInstallLinks } from './mcp-install-links.js';

/** Path of the remote MCP endpoint (served by BY-05). Install snippets point here. */
export const MCP_ENDPOINT_PATH = '/api/mcp';

export type { InstallSnippets } from '@gamedevpl/contract';

export interface ConnectPayload {
  installSnippets: InstallSnippets;
  /**
   * Credential-free one-click install deep links (BY-18c). Server URL only —
   * never an Authorization header or key. Hand-copy snippets remain the universal path.
   */
  installLinks: McpInstallLinks;
  /** Keyless kickoff — slug only, never a key. */
  kickoffPrompt: string;
  /** Absolute MCP endpoint URL. */
  mcpUrl: string;
  /** Full Authorization header line — for Copy only; never render. */
  authorizationHeader: string;
  /** Masked Authorization header for display. */
  authorizationHeaderMasked: string;
  /** Last five characters of the creator key — tell keys apart without leaking. */
  fingerprint: string;
  /**
   * Unix seconds. Identical to the minted creator key's signed `exp` claim — not a
   * separate display clock the UI could drift from.
   */
  expiresAt: number;
  /** Current creator keyGeneration — display/rotate UI; not a secret. */
  keyGeneration: number;
  /** Game slug embedded in the keyless prompt. */
  slug: string;
}

export interface BuildInstallSnippetsInput {
  /** Absolute origin, e.g. `https://www.gamedev.pl`. */
  appBaseUrl: string;
  /**
   * Authorization header value to embed (already `Bearer …` or masked).
   * Snippets for display should pass the masked form; Copy reconstructs with the real one.
   */
  authorizationBearer: string;
}

export interface BuildKickoffPromptInput {
  title: string;
  /**
   * Keyed mode (legacy / per-game): durable opener embedded as `key: …`.
   * Must not be set together with `slug` — never emit a key and a slug in one prompt.
   */
  gameKey?: string;
  /**
   * Keyless mode (BY-27b): game slug only. Requires the creator key to live in MCP
   * client config, not in the prompt.
   */
  slug?: string;
  /** Undelivered creator inbox lines, oldest first. */
  pendingMessages?: readonly { text: string }[];
  /**
   * When true (keyed mode only), append a line that nothing new needs pasting unless
   * the creator rotated (post-publish improve handoff — BY-20 + BY-23).
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
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
}

export interface MintGameKeyKickoffInput {
  slug: string;
  ownerUid: string;
  keyGeneration: number;
  title: string;
  submissionTokenSecret: string;
  appBaseUrl: string;
  pendingMessages?: readonly { text: string }[];
  sameKeyReminder?: boolean;
  now?: number;
}

/** Join origin + `/api/mcp`, trimming a trailing slash on the origin. */
export function mcpEndpointUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}${MCP_ENDPOINT_PATH}`;
}

/**
 * Per-client install snippets. Each configures the MCP endpoint URL and an
 * Authorization Bearer header. Pass a masked bearer for display snippets.
 */
export function buildInstallSnippets(input: BuildInstallSnippetsInput): InstallSnippets {
  const url = mcpEndpointUrl(input.appBaseUrl);
  const bearer = input.authorizationBearer.trim();
  const authHeaderLine = bearer.toLowerCase().startsWith('authorization:')
    ? bearer
    : `Authorization: ${bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`}`;
  const bearerValue = authHeaderLine.replace(/^Authorization:\s*/i, '').trim();

  return {
    claudeCode: `claude mcp add --transport http gamedevpl ${url} --header "${authHeaderLine}"`,
    codex: [`[mcp_servers.gamedevpl]`, `url = "${url}"`, `http_headers = { Authorization = "${bearerValue}" }`].join(
      '\n',
    ),
    cursor: JSON.stringify(
      {
        mcpServers: {
          gamedevpl: {
            url,
            headers: {
              Authorization: bearerValue,
            },
          },
        },
      },
      null,
      2,
    ),
    // Kimi Code has no first-class remote-HTTP add yet; mcp-remote is the documented
    // stdio bridge (third-party — we publish no package). Header via env is client-specific.
    kimi: `npx -y mcp-remote ${url}\n# set header: ${authHeaderLine}`,
    // Floor for agents that talk HTTP without an MCP client.
    cli: `curl -sS -X POST ${url} -H "${authHeaderLine}"`,
  };
}

/**
 * Paste-ready kickoff. Exactly one of `gameKey` or `slug` must be set — never both
 * (a key and a slug must not appear in the same prompt).
 *
 * Keyless (slug): Build "…" / Start with the gamedevpl tool, slug: … / start returns…
 * Keyed (legacy): Build "…" / Start with the gamedevpl tool, key: … / …
 *
 * User-facing copy says "key", never "token".
 */
export function buildKickoffPrompt(input: BuildKickoffPromptInput): string {
  const title = input.title.trim() || 'your game';
  const hasKey = Boolean(input.gameKey?.trim());
  const hasSlug = Boolean(input.slug?.trim());
  if (hasKey === hasSlug) {
    throw new Error('buildKickoffPrompt requires exactly one of gameKey or slug');
  }

  const lines = hasSlug
    ? [
        `Build "${title}" for gamedev.pl.`,
        `Start with the gamedevpl tool, slug: ${input.slug!.trim()}`,
        'start returns your workflow; after gate green the round is done.',
      ]
    : [
        `Build "${title}" for gamedev.pl.`,
        `Start with the gamedevpl tool, key: ${input.gameKey!.trim()}`,
        'start returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
      ];

  if (!hasSlug && input.sameKeyReminder) {
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
 * Legacy keyed kickoff for the per-game `/agent-key` routes (BY-23). Not used by the
 * connect card after BY-27b — that path is keyless via {@link mintConnectPayload}.
 */
export function mintGameKeyKickoff(input: MintGameKeyKickoffInput): {
  kickoffPrompt: string;
  expiresAt: number;
  keyGeneration: number;
  installSnippets: InstallSnippets;
  sameKeyAsBefore?: boolean;
} {
  const gameKey = mintGameAgentKey(input.submissionTokenSecret, {
    slug: input.slug,
    creatorUid: input.ownerUid,
    keyGeneration: input.keyGeneration,
    now: input.now,
  });
  const claims = verifyGameAgentKey(gameKey, input.submissionTokenSecret);
  return {
    // URL-only snippets for the legacy panel — the per-game key still rides the kickoff.
    installSnippets: {
      claudeCode: `claude mcp add --transport http gamedevpl ${mcpEndpointUrl(input.appBaseUrl)}`,
      codex: [`[mcp_servers.gamedevpl]`, `url = "${mcpEndpointUrl(input.appBaseUrl)}"`].join('\n'),
      cursor: JSON.stringify({ mcpServers: { gamedevpl: { url: mcpEndpointUrl(input.appBaseUrl) } } }, null, 2),
      kimi: `npx -y mcp-remote ${mcpEndpointUrl(input.appBaseUrl)}`,
      cli: `curl -sS -X POST ${mcpEndpointUrl(input.appBaseUrl)}`,
    },
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

/**
 * Mint a creator-wide opener and assemble the keyless connect payload.
 * `expiresAt` is taken from the key's verified `exp` claim so the UI's "expires"
 * line cannot disagree with auth. Install snippets embed the **masked** header;
 * the real `authorizationHeader` is for Copy only.
 */
export function mintConnectPayload(input: MintConnectPayloadInput): ConnectPayload {
  const creatorKey = mintCreatorAgentKey(input.submissionTokenSecret, {
    creatorUid: input.ownerUid,
    keyGeneration: input.keyGeneration,
    now: input.now,
  });
  const claims = verifyCreatorAgentKey(creatorKey, input.submissionTokenSecret);
  const authorizationHeader = `Authorization: Bearer ${creatorKey}`;
  const authorizationHeaderMasked = maskCreatorAgentKeyHeader(creatorKey);
  const fingerprint = creatorAgentKeyFingerprint(creatorKey);
  const mcpUrl = mcpEndpointUrl(input.appBaseUrl);

  return {
    installSnippets: buildInstallSnippets({
      appBaseUrl: input.appBaseUrl,
      authorizationBearer: authorizationHeaderMasked,
    }),
    // Deep links are built from the URL alone — never from authorizationHeader.
    installLinks: buildMcpInstallLinks(mcpUrl),
    kickoffPrompt: buildKickoffPrompt({
      title: input.title,
      slug: input.slug,
      pendingMessages: input.pendingMessages,
    }),
    mcpUrl,
    authorizationHeader,
    authorizationHeaderMasked,
    fingerprint,
    expiresAt: claims.exp,
    keyGeneration: claims.keyGeneration,
    slug: input.slug,
  };
}
