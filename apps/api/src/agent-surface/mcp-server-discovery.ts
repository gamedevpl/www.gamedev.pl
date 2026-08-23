/**
 * Live MCP server discovery document (BY-18c).
 *
 * Shape: official MCP Registry `server.json` schema
 * (`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`).
 * Served at `/.well-known/mcp/server.json` so clients that know the domain can
 * discover the remote Streamable HTTP endpoint without a registry round-trip.
 *
 * Auth facts are NOT duplicated here. The document points at the existing
 * RFC 9728 protected-resource metadata (`oauthProtectedResourceMetadataUrl`)
 * so authorization_servers / bearer methods cannot drift from BY-18a.
 *
 * Note (DOCUMENTED): SEP-2127 / Server Card (`/.well-known/mcp.json`) is still
 * an experimental working-group draft as of 2026-08 — not an accepted spec.
 * We ship the registry `server.json` shape, which the Server Card WG aims to
 * stay a subset of.
 */

import type { FastifyInstance } from 'fastify';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { oauthProtectedResourceMetadataUrl } from './mcp-oauth-metadata.js';
import { mcpEndpointUrl } from './self-build-connect.js';

/** Well-known path for the live registry-shaped descriptor. */
export const MCP_SERVER_JSON_PATH = '/.well-known/mcp/server.json';

/** Reverse-DNS name for the remote server (registry namespace rules). */
export const MCP_SERVER_REGISTRY_NAME = 'pl.gamedev/creator';

/**
 * Product version advertised in server.json — independent of the monorepo package version.
 *
 * This must track what is actually published to the official MCP Registry
 * (`listings/mcp/official-registry/server.json`), because the two documents describe the
 * same server and a client may read either. Registry versions are immutable, so any change
 * to the fields below ships as a bump in both places.
 */
export const MCP_SERVER_DESCRIPTOR_VERSION = '1.0.1';

const METADATA_CACHE_CONTROL = 'public, max-age=3600';

const SERVER_SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

/**
 * Description maxLength is 100 in the registry schema.
 *
 * Owner decision (2026-08-06): one description, with no closed-beta clause. This previously
 * had a `PRIVATE_BETA` variant that appended "Creating is closed beta (waitlist)", on the
 * reasoning that a listing promising "build games from your agent" to someone who cannot get
 * an account is a bait-and-switch found only after install. That trade-off is now accepted
 * deliberately: `websiteUrl` points at the homepage, which is where the beta gate is
 * explained, so the signal moved rather than disappearing.
 *
 * Keep this byte-identical to `listings/mcp/official-registry/server.json` — the published
 * registry entry is built from that file, and the two describe the same server.
 */
const SERVER_DESCRIPTION = 'Build browser games on gamedev.pl from your coding agent.';

export function buildMcpServerJsonDocument(): Record<string, unknown> {
  const origin = canonicalAppBaseUrl();
  return {
    $schema: SERVER_SCHEMA_URL,
    name: MCP_SERVER_REGISTRY_NAME,
    title: 'gamedev.pl',
    description: SERVER_DESCRIPTION,
    version: MCP_SERVER_DESCRIPTOR_VERSION,
    websiteUrl: origin,
    repository: {
      url: 'https://github.com/gamedevpl/www.gamedev.pl',
      source: 'github',
      // GitHub numeric repo id — stable across renames (registry guidance).
      id: '40428353',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: mcpEndpointUrl(origin),
      },
    ],
    // Auth lives in RFC 9728 PRM — reference only, never restate authorization_servers.
    _meta: {
      'pl.gamedev/auth': {
        oauth_protected_resource: oauthProtectedResourceMetadataUrl(),
      },
    },
  };
}

export function registerMcpServerDiscoveryRoutes(app: FastifyInstance): void {
  app.get(MCP_SERVER_JSON_PATH, async (_request, reply) => {
    return reply
      .header('Cache-Control', METADATA_CACHE_CONTROL)
      .type('application/json')
      .send(buildMcpServerJsonDocument());
  });
}
