import { describe, expect, it } from 'vitest';
import {
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
} from './visit-vocab.js';

describe('visit vocab', () => {
  it('lists visit route kinds', () => {
    expect(VISIT_ROUTE_KINDS).toEqual([
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
    ]);
  });

  it('lists play-started surfaces', () => {
    expect(PLAY_VIAS).toEqual([
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
    ]);
  });

  it('lists creation-funnel steps in order', () => {
    expect(CREATE_STEPS).toEqual([
      'prompt_started',
      'spec_submitted',
      'signin_required',
      'qa_shown',
      'title_confirmed',
      'submission_created',
      'handoff_shown',
      'handoff_enter_studio',
    ]);
  });

  it('lists waitlist steps', () => {
    expect(WAITLIST_STEPS).toEqual(['cta_clicked', 'joined']);
  });

  it('lists invite steps', () => {
    expect(INVITE_STEPS).toEqual(['opened', 'accepted', 'unavailable']);
  });

  it('lists beta welcome steps', () => {
    expect(BETA_WELCOME_STEPS).toEqual(['shown', 'continued', 'dismissed']);
  });

  it('lists how-to-play surfaces', () => {
    expect(HOW_TO_PLAY_VIAS).toEqual(['bar', 'more']);
  });

  it('lists studio funnel steps', () => {
    expect(STUDIO_STEPS).toEqual([
      'builder_chosen',
      'connect_copied',
      'connect_deeplink',
      'connect_dismissed',
      'connect_restored',
      'agent_signaled',
      'gate_verdict',
      'round_opened',
      'workspace_checkout',
      'idea_chip_shown',
      'idea_chip_used',
      'idea_chip_regenerated',
    ]);
  });

  it('lists studio step details', () => {
    expect(STUDIO_STEP_DETAILS).toEqual([
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
    ]);
  });

  it('lists editor steps', () => {
    expect(EDITOR_STEPS).toEqual([
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
    ]);
  });

  it('lists assist steps', () => {
    expect(ASSIST_STEPS).toEqual(['asked', 'applied', 'handoff', 'rejected']);
  });

  it('lists remix steps in order', () => {
    expect(REMIX_STEPS).toEqual([
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
    ]);
  });

  it('lists remix painted-via doors', () => {
    expect(REMIX_PAINTED_VIAS).toEqual(['redirect', 'menu', 'panel']);
  });

  it('lists remix entry controls', () => {
    expect(REMIX_CONTROLS).toEqual(['page', 'bar', 'more']);
  });

  it('lists code-surface steps', () => {
    expect(CODE_STEPS).toEqual([
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
    ]);
  });

  it('lists code completion kinds', () => {
    expect(CODE_COMPLETION_KINDS).toEqual(['language_service', 'ghost_text']);
  });

  it('lists code completion outcomes', () => {
    expect(CODE_COMPLETION_OUTCOMES).toEqual(['shown', 'empty', 'failed']);
  });
});
