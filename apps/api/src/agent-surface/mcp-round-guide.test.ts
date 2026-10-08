import { describe, expect, it } from 'vitest';
import { KIT_OUTDATED_MARK, MCP_INSTRUCTIONS, nextSuggestedTool, ROUND_SEQUENCE } from './mcp-round-guide.js';

const step = (tool: string, codes: string[], extra: Partial<Parameters<typeof nextSuggestedTool>[0]> = {}) =>
  nextSuggestedTool({ tool, warnings: codes.map((code) => ({ code, message: '' })), ...extra });

describe('mcp-round-guide', () => {
  it('never names a delivery as the next step', () => {
    // "Deliver before finishing" is a condition, not permission now.
    for (const codes of [
      ['must_deliver'],
      ['must_fix_gate'],
      ['gate_not_started'],
      ['must_deliver', 'progress_stale'],
    ]) {
      expect(step('report_progress', codes)).toBeUndefined();
    }
  });

  it('suggests reads and closes only when the state alone justifies them', () => {
    expect(step('get_sources', ['must_deliver', 'inbox_pending'])).toBe('read_inbox');
    expect(step('get_kit_api', ['transcript_unread'])).toBe('get_transcript');
    expect(step('submit_sources', ['call_end'])).toBe('end');
    expect(step('submit_sources', ['call_end', 'gate_not_started'])).toBeUndefined();
    // Staging after a delivery is new work, not a close.
    expect(step('stage_source_file', ['call_end'])).toBeUndefined();
    expect(step('stage_source_file', ['typecheck_hint', 'inbox_pending'])).toBeUndefined();
  });

  it('refreshes a stale kit before anything else, and only a stale kit', () => {
    const refused = (message: string) =>
      nextSuggestedTool({ tool: 'start', warnings: [{ code: 'must_fix_gate', message }] });
    expect(refused(`The gate refused delivery v2 because ${KIT_OUTDATED_MARK}.`)).toBe('get_kit');
    // Naming kit_outdated in passing is not a stale-kit refusal.
    expect(refused('Refused; a stale kit (kit_outdated) would take fromLatestDelivery.')).toBeUndefined();
    expect(refused('The preview check (typecheck, smoke, build) refused delivery v2.')).toBeUndefined();
    // Once refreshed, a breaking kit may need code: no loop.
    expect(
      nextSuggestedTool({
        tool: 'get_kit',
        warnings: [{ code: 'must_fix_gate', message: `refused because ${KIT_OUTDATED_MARK}` }],
        kitRefreshed: true,
      }),
    ).toBeUndefined();
  });

  it('follows stop and its reason', () => {
    expect(step('report_progress', ['inbox_pending'], { stop: true, reason: 'builder_handoff' })).toBe('end');
    expect(step('get_gate_verdict', ['call_end'], { stop: true, reason: 'gate_pending' })).toBe('end');
    expect(step('get_gate_verdict', [], { stop: true, reason: 'gate_green' })).toBeUndefined();
    expect(step('read_inbox', ['inbox_pending'], { stop: true, reason: 'stopped' })).toBeUndefined();
  });

  it('gives a client with no skill and no system prompt the whole round in one short block', () => {
    for (const fact of [
      /get_brief/,
      /get_sources/,
      /read_inbox/,
      /get_transcript/,
      /changes a buffer only/,
      /submit_sources delivers/,
      /re-runs only on a new submit_sources, after its cause is fixed/,
      /end closes this session/,
      /round closes on a green publish verdict/,
      /only answers a question can end/,
      /Without a shell/,
      /get_gate_media/,
      /builder_handoff is acknowledged by one end call/,
      /gate_pending means the build is still running/,
    ]) {
      expect(MCP_INSTRUCTIONS).toMatch(fact);
    }
  });

  it('keeps the instructions short and every step a statement', () => {
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(3000);
    for (const line of ROUND_SEQUENCE) {
      expect(line).not.toMatch(/\b(ALWAYS|NEVER|MUST|STOP|END)\b/);
      expect(line).not.toMatch(/^(call|use|do|don't|never|always)\b/i);
    }
  });
});
