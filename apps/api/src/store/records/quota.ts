import { type ManagedAgentVendorName, type ManagedBuilderMode } from '@gamedevpl/contract';

/**
 * The creation circuit-breaker, stored rather than deployed.
 *
 * Per-user quotas bound what one creator costs; nothing bounded what *everyone*
 * costs, so total spend was bounded only by the invite count. These two fields are
 * the ceiling and the off switch.
 *
 * They live in Firestore instead of in the environment because an env change means a
 * new Cloud Run revision, and a redeploy mid-incident drops every party room in
 * flight — a breaker you cannot pull without breaking something else is not a
 * breaker. Readers cache with a short TTL, so a flip takes effect within about a
 * minute on every instance and costs a document read a minute in between.
 */
export interface CreationLimits {
  /** Refuse new game creation entirely, with a message that says so honestly. */
  paused: boolean;
  /**
   * Ceiling on submissions accepted per UTC day across every account. `null` means
   * no stored ceiling, in which case the reader's own default applies — "unset"
   * must never read as "unlimited".
   */
  globalDailySubmissionCap: number | null;
  /** Refuse the real-time editing lanes (assist + code) outright. Play is untouched. */
  editingPaused: boolean;
  /**
   * Stop emitting the remix code-lane trace, without waiting for a deploy.
   *
   * The trace is switched *on* by a deploy-threaded env flag, which is right for
   * something deliberate — but it carries the player's own utterance, so "off"
   * cannot wait for the next release. Clearing the variable does nothing to a
   * running revision; this does, within the breaker's TTL, from the same
   * document an operator already opens during an incident.
   */
  remixTracePaused?: boolean;
  /**
   * Ceiling on paid editing model calls per UTC day, everyone together — the
   * "worst day costs a known number" breaker the remix lanes require before any
   * flag goes on. Same null semantics as the submission cap.
   */
  globalDailyEditCap: number | null;
  // Refuse the studio mini chat agent outright; feedback/improve still work normally.
  chatPaused?: boolean;
  // Own daily ceiling on chat-agent calls, separate from the edit cap.
  globalDailyChatCap?: number | null;
  // Refuse the tab-complete ghost-text lane outright (TA-*); Play/editing untouched.
  tabCompletePaused?: boolean;
  // Shared daily token ceiling for ghost-text completion, everyone together.
  globalDailyTabCompleteTokenCap?: number | null;
  // Switches the `platform` option; `auto` defers to whether a backend exists.
  managedBuilderMode?: ManagedBuilderMode;
  // Runtime override; unset defers to MANAGED_AGENT_VENDOR, the env-var default.
  managedAgentVendorOverride?: ManagedAgentVendorName | null;
  // Shared daily ceiling on platform rounds started. `null` = no cap.
  managedDailyCap: number | null;
  // Same ceiling, per creator per UTC day.
  managedDailyUserCap: number | null;
  // Round 0's kill switch; no env var exists for it.
  seedingMode?: 'auto' | 'off';
  // Runtime override; unset defers to SEED_PROVIDER. Free-form: providers self-register.
  seedProviderOverride?: string | null;
  /** Who last changed this and when, so a leftover pause is legible as a leftover. */
  updatedAt?: string;
  updatedBy?: string;
}

export interface PublicPlayConfig {
  slugs: string[];
  updatedAt?: string;
  updatedBy?: string;
}

// Never derive this from isPlatformAuthor — true for erased accounts too.
export interface FeaturedPoolConfig {
  slugs: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface UsageCounters {
  submissions: number;
  previews: number;
  mocks: number;
  refines: number;
  feedback: number;
  playerFeedback: number;
  /** Creator-requested improvements on already-published games (studio control panel). */
  improvements: number;
  /** Natural-language tuning requests in the editor (one Vertex call each). */
  assists: number;
  // Studio mini chat agent turns (chat-agent.ts), one per model call.
  chats: number;
  // Platform rounds this creator started today.
  managedBuilds: number;
  // Ghost-text completion calls today (TA-01), one per model call.
  tabCompletes: number;
}
