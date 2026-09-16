// Types, constants, and schemas shared across workspaces — no I/O.

export { AGENT_CHANNEL_ROUTES, type AgentChannelRouteKey, type AgentChannelRoutePath } from './agent-channel-routes.js';
export { AGENT_PLAY_BRIDGE } from './agent-play-bridge.js';
export { ASSESSMENT_CHECKLIST_KEYS, type AssessmentChecklistKey } from './assessment-checklist.js';
export { ASSIST_LANES, type AssistLane } from './assist-lane.js';
export { AUTONOMY_MODES, type AutonomyMode } from './autonomy-mode.js';
export { AVATAR_MODES, type AvatarMode } from './avatar-mode.js';
export { BUILD_EVENT_KINDS, BUILD_STEPS, type BuildEventKind, type BuildStep } from './build-event.js';
export { BUILDER_UNAVAILABLE_REASONS, type BuilderUnavailableReason } from './builder-availability.js';
export { BUILDERS, isBuilderKind, type BuilderKind } from './builder-kind.js';
export { CATALOG_PUBLISHED_STATUS, isPublishedEntry } from './catalog-entry.js';
export type {
  CatalogEntry,
  CatalogEditor,
  CatalogMedia,
  CatalogMultiplayer,
  CatalogSaves,
  CatalogScreenshot,
  CatalogSensing,
  CatalogWorld,
} from './catalog-entry.js';
export {
  CATALOG_ORIENTATIONS,
  CATALOG_TOUCH_VALUES,
  type CatalogOrientation,
  type CatalogTouch,
} from './catalog-vocab.js';
export { CHAT_AGENT_SCOPES, type ChatAgentScope } from './chat-agent-scope.js';
export {
  BETA_INVITE_STATUSES,
  CONTRIBUTION_MODES,
  VOTE_VALUES,
  WAITLIST_STATUSES,
  type BetaInviteStatus,
  type ContributionMode,
  type VoteValue,
  type WaitlistStatus,
} from './community-vocab.js';
export { CONNECT_CLIENTS, type ConnectClient, type InstallSnippets } from './connect-client.js';
export { DECLINE_REASONS, type DeclineReason } from './decline-reason.js';
export { DELIVERY_MODES, type DeliveryMode } from './delivery-mode.js';
export { DISMISS_REASONS, type DismissReason } from './dismiss-reason.js';
export type { GameHealth } from './game-health.js';
export type { GameProject } from './game-project.js';
export {
  MAX_AGENT_SHOT_BYTES,
  MAX_GAME_SAVE_BYTES,
  MAX_MULTIPLAYER_SLOTS,
  MAX_SHOT_BYTES,
  MAX_TITLE_LENGTH,
} from './game-limits.js';
export {
  GATE_PROGRESS_LANES,
  GATE_PROGRESS_STAGES,
  type GateProgress,
  type GateProgressLane,
  type GateProgressStage,
} from './gate-progress.js';
export { deriveGateStatusString, derivePreviewGateStatus, GATE_STATUS_VALUES, type GateStatus } from './gate-status.js';
export { JOB_STALL_VALUES, JOB_STATES, type JobStall, type JobState } from './job-state.js';
export { LOCALES, type Locale } from './locale.js';
export { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from './managed-agent-vendor.js';
export { MANAGED_BUILDER_MODES, type ManagedBuilderMode } from './managed-builder-mode.js';
export { INPUT_KEYS, MP_PROTOCOL_VERSION, ROOM_PHASES, type InputKey, type RoomPhase } from './mp-protocol.js';
export { PREFLIGHT_KINDS, type PreflightKind } from './preflight-kind.js';
export { PROPERTY_TYPES, type PropertyType } from './property-type.js';
export { PROPOSAL_PUBLIC_STATES, type ProposalPublicState } from './proposal-public-state.js';
export { RECOMMEND_REASONS, type RecommendReason } from './recommend-reason.js';
export {
  REMIX_SUGGESTION_DIRECTIONS,
  REMIX_SUGGESTION_STARTERS,
  type RemixSuggestion,
  type RemixSuggestionDirection,
  type RemixSuggestionStarterId,
} from './remix-suggestion.js';
export {
  ASSESSMENT_CHECKLIST_MARKS,
  ASSESSMENT_INPUT_METHODS,
  ASSESSMENT_NOTE_ORIGINS,
  ASSESSMENT_PLATFORMS,
  ASSESSMENT_RESOLUTION_STATUSES,
  ASSESSMENT_SOURCES,
  ASSESSMENT_VERDICTS,
  RE_REVIEW_REQUEST_STATUSES,
  REVIEW_SWEEP_SOURCES,
  REVIEW_SWEEP_STATUSES,
  type AssessmentChecklistMark,
  type AssessmentInputMethod,
  type AssessmentNoteOrigin,
  type AssessmentPlatform,
  type AssessmentResolutionStatus,
  type AssessmentSource,
  type AssessmentVerdict,
  type ReReviewRequestStatus,
  type ReviewSweepSource,
  type ReviewSweepStatus,
} from './review-vocab.js';
export {
  MODERATION_FLAG_ACTIONS,
  MODERATION_FLAG_REASONS,
  MODERATION_FLAG_STATUSES,
  isModerationFlagReason,
  type ModerationFlagAction,
  type ModerationFlagReason,
  type ModerationFlagStatus,
} from './moderation-vocab.js';
export { SOCKET_STATUSES, type SocketStatus } from './socket-status.js';
export { DEFAULT_MAX_SOCKETS_PER_IP, MAX_SOCKET_FRAME_BYTES, MAX_SOCKET_FRAMES_PER_SECOND } from './socket-limits.js';
export { createFrameLimiter, type FrameLimiter } from './frame-limiter.js';
export type {
  BuildEvent,
  BuildMediaItem,
  BuildPlayableItem,
  BuildPlayableOrigin,
  BuildProgress,
  ChecklistItem,
  CreatorRevision,
  MySubmission,
  MySubmissionsPage,
  PlatformBuilderAvailability,
  PriorRoundEntry,
  PriorRoundHistory,
  RecentBuild,
  StoredBuildEvent,
  StoredCreatorRevision,
  SubmissionPublishedResponse,
  CreatorProposal,
  CreatorProposalOption,
  SubmissionStatusResponse,
  SubmissionStatusResponseBase,
} from './submission-status.js';
export {
  SUBMISSION_IN_FLIGHT_STATES,
  SUBMISSION_STATES,
  isSubmissionInFlight,
  type SubmissionState,
} from './submission-state.js';
export type {
  StudioBuildsResponse,
  StudioGame,
  StudioGamesResponse,
  StudioHealthResponse,
  StudioScorecard,
  StudioScorecardsResponse,
} from './studio-status.js';
export { TREND_GRAINS, type TrendGrain } from './trend-grain.js';
export * from './visit-vocab-contract.js';
export { MAX_WORLD_ENTRY_BYTES, MAX_WORLD_FIELDS, MAX_WORLD_KEY_LENGTH } from './world-limits.js';
export { ZONE_LINK_STEPS, type ZoneLinkStep } from './zone-link-step.js';
export {
  MAX_PLAYERS_PER_ZONE,
  MAX_STATE_BYTES,
  RESERVED_EVENT_KINDS,
  TICK_HZ_VALUES,
  type TickHz,
  type ZoneEvent,
} from './zone-contract.js';
export { ZONE_PROTOCOL_VERSION } from './zone-protocol.js';
export { isCliAction, type CliAction, type CliSessionContext } from './cli-assistant.js';

export type { LocalActivity } from './local-activity.js';
export {
  EDITOR_CONTENT_FILE,
  EDITOR_FILE,
  EDITOR_SPEC_KEY,
  EDITOR_SPEC_VALUE,
  GENERATED_CONTENT_PATH,
  LAYERS_KEY,
  MAX_COLLECTIONS,
  MAX_COLLECTION_ITEMS,
  MAX_CONSTRAINTS,
  MAX_EDITOR_JSON_BYTES,
  MAX_ENUM_VALUES,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  MAX_LAYER_ITEMS,
  MAX_LAYER_TOTAL_CELLS,
  MAX_LAYERS,
  MAX_PARAMS,
  MAX_PATH_POINTS,
  MAX_PROPERTIES,
  MAX_TEXT_LENGTH,
  MAX_TILES,
  PARAMS_KEY,
  isPlainObject,
  type CollectionItemSpec,
  type CollectionSpec,
  type EditorConstraint,
  type EditorContentDocument,
  type EditorDefinition,
  type EditorLabel,
  type EditorLayerConstraint,
  type EditorLayerContent,
  type EditorLayerSpec,
  type EditorLayersContent,
  type EditorVersion,
  type EntitiesItemSpec,
  type EntitiesLayerSpec,
  type EntityItemContent,
  type LayerTileRef,
  type LayeredItemContent,
  type LayeredItemSpec,
  type ParamSpec,
  type ParamValue,
  type PathItemContent,
  type PathItemSpec,
  type PathPoint,
  type PropertySpec,
  type TileSpec,
  type TilemapItemContent,
  type TilemapItemSpec,
  type TilemapLayerSpec,
} from './editor-kit.js';
export {
  propertyValueErrors,
  validateCollectionContent,
  validateEditorContent,
  validateItemContent,
  validateLayerContent,
  valueProblem,
} from './editor-validate.js';
export { validateLayerReachable } from './editor-validate-reach.js';
