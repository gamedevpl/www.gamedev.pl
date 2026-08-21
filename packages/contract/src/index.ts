// Types, constants, and schemas shared across workspaces — no I/O.

export { AGENT_CHANNEL_ROUTES, type AgentChannelRouteKey, type AgentChannelRoutePath } from './agent-channel-routes.js';
export { ASSESSMENT_CHECKLIST_KEYS, type AssessmentChecklistKey } from './assessment-checklist.js';
export { ASSIST_LANES, type AssistLane } from './assist-lane.js';
export { BUILD_EVENT_KINDS, BUILD_STEPS, type BuildEventKind, type BuildStep } from './build-event.js';
export {
  CATALOG_ORIENTATIONS,
  CATALOG_TOUCH_VALUES,
  type CatalogOrientation,
  type CatalogTouch,
} from './catalog-vocab.js';
export { DECLINE_REASONS, type DeclineReason } from './decline-reason.js';
export { GATE_PROGRESS_LANES, type GateProgressLane } from './gate-progress.js';
export { deriveGateStatusString, derivePreviewGateStatus, GATE_STATUS_VALUES, type GateStatus } from './gate-status.js';
export { JOB_STALL_VALUES, JOB_STATES, type JobStall, type JobState } from './job-state.js';
export { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from './managed-agent-vendor.js';
export { INPUT_KEYS, ROOM_PHASES, type InputKey, type RoomPhase } from './mp-protocol.js';
export { PROPERTY_TYPES, type PropertyType } from './property-type.js';
export { SUBMISSION_STATES, type SubmissionState } from './submission-state.js';
export { TREND_GRAINS, type TrendGrain } from './trend-grain.js';
export {
  ASSIST_STEPS,
  BETA_WELCOME_STEPS,
  CODE_COMPLETION_KINDS,
  CODE_COMPLETION_OUTCOMES,
  CODE_STEPS,
  CREATE_STEPS,
  EDITOR_STEPS,
  HOW_TO_PLAY_VIAS,
  INVITE_STEPS,
  PLAY_VIAS,
  REMIX_CONTROLS,
  REMIX_PAINTED_VIAS,
  REMIX_STEPS,
  STUDIO_STEP_DETAILS,
  STUDIO_STEPS,
  VISIT_ROUTE_KINDS,
  WAITLIST_STEPS,
  type AssistStep,
  type BetaWelcomeStep,
  type CodeCompletionKind,
  type CodeCompletionOutcome,
  type CodeStep,
  type CreateStep,
  type EditorStep,
  type HowToPlayVia,
  type InviteStep,
  type PlayVia,
  type RemixControl,
  type RemixPaintedVia,
  type RemixStep,
  type StudioStep,
  type StudioStepDetail,
  type VisitRouteKind,
  type WaitlistStep,
} from './visit-vocab.js';
export { ZONE_LINK_STEPS, type ZoneLinkStep } from './zone-link-step.js';
