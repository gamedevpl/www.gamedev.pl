// Types, constants, and schemas shared across workspaces — no I/O.

export { AGENT_CHANNEL_ROUTES, type AgentChannelRouteKey, type AgentChannelRoutePath } from './agent-channel-routes.js';
export { ASSESSMENT_CHECKLIST_KEYS, type AssessmentChecklistKey } from './assessment-checklist.js';
export { ASSIST_LANES, type AssistLane } from './assist-lane.js';
export { BUILD_EVENT_KINDS, BUILD_STEPS, type BuildEventKind, type BuildStep } from './build-event.js';
export { DECLINE_REASONS, type DeclineReason } from './decline-reason.js';
export { GATE_PROGRESS_LANES, type GateProgressLane } from './gate-progress.js';
export { deriveGateStatusString, derivePreviewGateStatus, GATE_STATUS_VALUES, type GateStatus } from './gate-status.js';
export { JOB_STALL_VALUES, JOB_STATES, type JobStall, type JobState } from './job-state.js';
export { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from './managed-agent-vendor.js';
export { INPUT_KEYS, ROOM_PHASES, type InputKey, type RoomPhase } from './mp-protocol.js';
export { PROPERTY_TYPES, type PropertyType } from './property-type.js';
export { SUBMISSION_STATES, type SubmissionState } from './submission-state.js';
