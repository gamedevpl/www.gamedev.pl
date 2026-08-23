/**
 * The target N1 module map for `apps/api/src`, per docs/north-star-architecture.md Phase 0/3.
 *
 * Phase 3 physically moves files into these directories and flips the boundary rule from
 * warn to error, module by module. Phase 0 only needs the *assignment* — which bucket each
 * file already belongs to by its current name and purpose — so cross-bucket imports are
 * visible in review before any file moves. A file not listed here defaults to `platform`
 * (importable by, and free to import, everything else): the map only needs to be complete
 * enough to catch real domain reaches, not exhaustive on day one.
 */

/** Doc order: platform, creation, agent-surface, delivery, catalog, community, realtime, telemetry, notifications. */
export const MODULE_BUCKETS = [
  'platform',
  'creation',
  'agent-surface',
  'delivery',
  'catalog',
  'community',
  'realtime',
  'telemetry',
  'notifications',
];

const DEFAULT_BUCKET = 'platform';

/** Filename (no directory, no .ts/.test.ts) -> bucket. Anything unlisted is `platform`. */
const FILE_BUCKET = {
  // creation: jobs, rounds, dispatch, seed, refine
  'job-state': 'creation',
  'job-costs': 'creation',
  'job-admin-routes': 'creation',
  'dispatch-reaper': 'creation',
  refine: 'creation',
  'round-base-version': 'creation',
  'creation-limits': 'creation',
  'quota-gate': 'creation',
  autonomy: 'creation',
  builder: 'creation',
  'typecheck-preflight': 'creation',
  'source-patch': 'creation',
  'code-lane': 'creation',
  'code-surface': 'creation',
  'symbol-map': 'creation',
  'ts-any-scan': 'creation',
  'type-check': 'creation',
  'tab-complete': 'creation',
  'editor-assist': 'creation',
  'editor-contract': 'creation',
  'editor-drafts': 'creation',
  remix: 'creation',
  'remix-save': 'creation',
  'remix-suggestions': 'creation',
  'remix-turns': 'creation',
  'agent-build-brief': 'creation',
  'agent-build-examples': 'creation',
  'agent-state': 'creation',
  'agent-tasks': 'creation',
  'chat-agent': 'creation',
  'chat-turns': 'creation',
  'creator-code': 'creation',
  'creator-studio': 'creation',
  'creator-profile': 'creation',
  'creator-profile-routes': 'creation',
  'seed-context': 'creation',
  'seed-bundle': 'creation',
  'seed-availability': 'creation',
  'seed-status': 'creation',
  'seed-stream': 'creation',
  'seed-provider': 'creation',
  'seed-provider-anthropic': 'creation',
  'seed-provider-meta': 'creation',
  'seed-provider-openai': 'creation',
  'seed-provider-openrouter': 'creation',
  'seed-provider-vertex': 'creation',
  'version-verdict': 'creation',
  'module-size': 'creation',
  'game-seed': 'creation',
  'session-crash': 'creation',
  scorecard: 'creation',
  'knowledge-search': 'creation',
  'example-files': 'creation',

  // agent-surface: channel + MCP + kit
  'agent-channel': 'agent-surface',
  'mcp-server': 'agent-surface',
  'mcp-server-discovery': 'agent-surface',
  'mcp-ui': 'agent-surface',
  'mcp-oauth-metadata': 'agent-surface',
  'mcp-session-key': 'agent-surface',
  'mcp-session-nudges': 'agent-surface',
  'mcp-debug-log': 'agent-surface',
  'mcp-install-links': 'agent-surface',
  'mcp-presence': 'agent-surface',
  'agent-token': 'agent-surface',
  'agent-upload-token': 'agent-surface',
  'agent-session-revocation': 'agent-surface',
  'agent-creator-key': 'agent-surface',
  'agent-creator-key-resolve': 'agent-surface',
  'agent-game-key': 'agent-surface',
  'agent-game-key-resolve': 'agent-surface',
  'agent-backend': 'agent-surface',
  'agent-backend-env': 'agent-surface',
  'managed-agent': 'agent-surface',
  'managed-availability': 'agent-surface',
  'managed-backend': 'agent-surface',
  'managed-provider-anthropic': 'agent-surface',
  'managed-provider-copilot': 'agent-surface',
  'managed-provider-gemini': 'agent-surface',
  'managed-provider-openai': 'agent-surface',
  'self-build-backend': 'agent-surface',
  'self-build-connect': 'agent-surface',
  'creator-agent-key-routes': 'agent-surface',
  'kit-digest': 'agent-surface',
  'kit-files': 'agent-surface',
  'kit-registry': 'agent-surface',
  'kit-window': 'agent-surface',
  'editor-kit-env': 'agent-surface',
  genai: 'agent-surface',

  // delivery: staging, games-store, gate
  'staged-preview': 'delivery',
  'stage-hints': 'delivery',
  'games-store': 'delivery',
  'gcs-sign': 'delivery',
  'workspace-archive': 'delivery',
  tar: 'delivery',
  'build-transcript': 'delivery',
  'build-changelog': 'delivery',
  'build-preview-limits': 'delivery',
  'build-prompt': 'delivery',
  'manifest-source': 'delivery',
  'source-delivery': 'delivery',
  'recent-builds': 'delivery',
  'gate-runner': 'delivery',
  'gate-progress': 'delivery',
  'gate-trigger': 'delivery',
  'gate-verdict': 'delivery',
  'gate-crash': 'delivery',
  'gate-screenshot': 'delivery',

  // catalog: github-client, snapshots, assemble, play
  'github-client': 'catalog',
  'github-rate-limit': 'catalog',
  'game-snapshot': 'catalog',
  'game-snapshot-publish': 'catalog',
  assemble: 'catalog',
  'catalog-genre-source': 'catalog',
  'catalog-touch': 'catalog',
  recommend: 'catalog',
  recommendations: 'catalog',
  'published-slugs': 'catalog',
  'owner-games': 'catalog',
  'owner-of-record': 'catalog',
  'game-page-routes': 'catalog',
  'game-manifest-hint': 'catalog',
  'game-health': 'catalog',
  'games-repo-archive': 'catalog',
  'games-repo-contract': 'catalog',
  'games-repo-contract-check': 'catalog',
  'local-games-repo': 'catalog',
  'index-html-generator': 'catalog',
  slug: 'catalog',
  'slug-backfill': 'catalog',

  // community: votes, feedback, review, proposals, suggestions
  votes: 'community',
  'player-feedback': 'community',
  'feedback-themes': 'community',
  review: 'community',
  'review-checklist': 'community',
  'review-sweep': 'community',
  'proposal-apply-bot': 'community',
  'proposal-base': 'community',
  'proposal-diff': 'community',
  'proposal-routes': 'community',
  'proposal-state': 'community',
  proposals: 'community',
  'suggestion-inbox': 'community',
  'suggestion-outcomes': 'community',
  'suggestion-sweep': 'community',
  suggestions: 'community',
  'editorial-suggestions': 'community',

  // realtime: mp, presence, worlds, zones
  mp: 'realtime',
  'mp-relay': 'realtime',
  presence: 'realtime',
  worlds: 'realtime',
  'world-schema': 'realtime',
  'world-source': 'realtime',
  'game-saves': 'realtime',
  zones: 'realtime',
  'zone-source': 'realtime',

  // telemetry
  telemetry: 'telemetry',
  'telemetry-health': 'telemetry',
  'telemetry-trends': 'telemetry',
  'visit-funnel': 'telemetry',
  'visit-telemetry': 'telemetry',
  'delivery-metrics': 'telemetry',
  'creator-metrics': 'telemetry',
  'chat-agent-metrics': 'telemetry',
  'knowledge-metrics': 'telemetry',
  'moderation-metrics': 'telemetry',

  // notifications
  notify: 'notifications',
  notifications: 'notifications',
  'game-follow-notify': 'notifications',
  'game-follow-routes': 'notifications',
  'email-routes': 'notifications',
  'email-templates': 'notifications',
  mailer: 'notifications',
  'push-routes': 'notifications',
  pusher: 'notifications',
  'unsubscribe-token': 'notifications',
  contact: 'notifications',
  'operator-alerts': 'notifications',
};

/**
 * Bucket for a file, given its path relative to `apps/api/src` (posix, extension stripped).
 * `store/**` is the shared persistence layer, not a domain -- always `platform`.
 */
export function classifyModule(relativePathNoExt) {
  if (relativePathNoExt === 'store' || relativePathNoExt.startsWith('store/')) return DEFAULT_BUCKET;
  const basename = relativePathNoExt.split('/').pop();
  return FILE_BUCKET[basename] ?? DEFAULT_BUCKET;
}

export { DEFAULT_BUCKET };
