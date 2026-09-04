// Visit telemetry vocabulary shared between the funnel read side and its intake.

export const VISIT_ROUTE_KINDS = [
  'home',
  'play',
  'draft',
  'status',
  'join',
  'invite',
  'legal',
  'health',
  'studio',
  'game',
  'create',
  'party',
  'notFound',
] as const;
export type VisitRouteKind = (typeof VISIT_ROUTE_KINDS)[number];

export const PLAY_VIAS = [
  'featured',
  'rail_start_here',
  'rail_continue',
  'rail_party',
  'rail_new',
  'grid',
  'composer_match',
  'create_showcase',
  'shelf',
  'featured_similar',
  'party_page',
] as const;
export type PlayVia = (typeof PLAY_VIAS)[number];

export const CREATE_STEPS = [
  'prompt_started',
  'spec_submitted',
  'signin_required',
  'qa_shown',
  'title_confirmed',
  'submission_created',
  'handoff_shown',
  'handoff_enter_studio',
] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

export const WAITLIST_STEPS = ['cta_clicked', 'joined'] as const;
export type WaitlistStep = (typeof WAITLIST_STEPS)[number];

export const INVITE_STEPS = ['opened', 'accepted', 'unavailable'] as const;
export type InviteStep = (typeof INVITE_STEPS)[number];

export const BETA_WELCOME_STEPS = ['shown', 'continued', 'dismissed'] as const;
export type BetaWelcomeStep = (typeof BETA_WELCOME_STEPS)[number];

export const HOW_TO_PLAY_VIAS = ['bar', 'more'] as const;
export type HowToPlayVia = (typeof HOW_TO_PLAY_VIAS)[number];

export const STUDIO_STEPS = [
  'builder_chosen',
  'connect_copied',
  'connect_deeplink',
  'connect_dismissed',
  'connect_restored',
  'agent_signaled',
  'gate_verdict',
  'round_opened',
  'workspace_checkout',
  // NP-1: Layer-2 next-prompt idea chips.
  'idea_chip_shown',
  'idea_chip_used',
  'idea_chip_regenerated',
] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export const STUDIO_STEP_DETAILS = [
  'install',
  'kickoff',
  'header',
  'cursor',
  'vscode',
  'green',
  'red',
  'kit_outdated',
  'creator',
  'agent',
] as const;
export type StudioStepDetail = (typeof STUDIO_STEP_DETAILS)[number];

export const EDITOR_STEPS = [
  'opened',
  'draft_saved',
  'previewed',
  'published',
  'v2_schema_loaded',
  'v2_content_loaded',
  'v2_controller_ready',
  'v2_controller_failed',
  'controller_loaded',
  'controller_failed',
  'tool_used',
  'undo_used',
  'selection_from_game',
] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

export const ASSIST_STEPS = ['asked', 'applied', 'handoff', 'rejected'] as const;
export type AssistStep = (typeof ASSIST_STEPS)[number];

export const REMIX_STEPS = [
  'offered',
  'opened',
  'no_lane',
  'typed',
  'wall_shown',
  'signed_in',
  'tuned',
  'painted',
  'asked',
  'applied',
  'broken',
  'undone',
  'handoff',
  'refused',
  'shared',
  'keep_clicked',
  'proposed',
] as const;
export type RemixStep = (typeof REMIX_STEPS)[number];

export const REMIX_PAINTED_VIAS = ['redirect', 'menu', 'panel'] as const;
export type RemixPaintedVia = (typeof REMIX_PAINTED_VIAS)[number];

export const REMIX_CONTROLS = ['page', 'bar', 'more'] as const;
export type RemixControl = (typeof REMIX_CONTROLS)[number];

export const CODE_STEPS = [
  'offered',
  'opened',
  'file_opened',
  'edited',
  'typechecked',
  'previewed',
  'delivered',
  'published',
  'read_only_agent',
  'conflict_seen',
  'round_reopened',
  'restored_missing',
  'agent_mode_enabled',
  'agent_mode_disabled',
  'agent_console_run',
] as const;
export type CodeStep = (typeof CODE_STEPS)[number];

export const CODE_COMPLETION_KINDS = ['language_service', 'ghost_text'] as const;
export type CodeCompletionKind = (typeof CODE_COMPLETION_KINDS)[number];

export const CODE_COMPLETION_OUTCOMES = ['shown', 'empty', 'failed'] as const;
export type CodeCompletionOutcome = (typeof CODE_COMPLETION_OUTCOMES)[number];
