import { describe, expect, it } from 'vitest';
import { scoreSession } from './session-score-lib.mjs';

const at = (second) => `2026-11-18T22:00:${String(second).padStart(2, '0')}.000Z`;
const mcp = (second, name, input = {}) => ({ type: 'agent.mcp_tool_use', processed_at: at(second), name, input });
const bash = (second, command) => ({
  type: 'agent.tool_use',
  processed_at: at(second),
  name: 'bash',
  input: { command },
});
const request = (second, read) => ({
  type: 'span.model_request_end',
  processed_at: at(second),
  model_usage: { cache_read_input_tokens: read, cache_creation_input_tokens: 10, output_tokens: 5 },
});

describe('scoreSession', () => {
  it('times the phases, sums the tokens and flags what the round skipped', () => {
    const score = scoreSession([
      { type: 'session.status_running', processed_at: at(0) },
      mcp(1, 'start'),
      mcp(2, 'start'),
      mcp(3, 'report_progress'),
      {
        type: 'agent.tool_use',
        processed_at: at(10),
        name: 'write',
        input: { file_path: '/w/games/x/ACCEPTANCE.json', content: '{"achieved":[{"field":"state","equals":"lost"}]}' },
      },
      bash(20, 'npm run play -- x --text --replay CAPTURE.json'),
      request(25, 300),
      bash(30, 'npm run play -- x --text --replay CAPTURE.json'),
      request(35, 100),
      mcp(40, 'submit_sources'),
      mcp(41, 'end', { summary: 'Capture scripts a loss only; win not verified.' }),
      {
        type: 'agent.message',
        processed_at: at(50),
        content: [{ text: 'A long closing note that nobody reads at all.' }],
      },
      { type: 'session.usage', processed_at: at(51), usage: { list_cost: { amount: '7' } } },
    ]);
    expect(score.seconds).toEqual({
      total: 51,
      toFirstEdit: 10,
      toFirstSubmit: 40,
      replayPhase: 10,
      longestProgressGap: 38,
    });
    expect(score.calls).toMatchObject({ replays: 2, captures: 2, starts: 2, progressReports: 1, submits: 1 });
    expect(score.tokens).toMatchObject({ cacheRead: 400, cacheWrite: 20, output: 10, replayPhaseCacheReadShare: 0.75 });
    expect(score.listCost).toBe('7');
    expect(score.flags).toEqual(['acceptance_names_loss', 'win_not_reached', 'repeated_start', 'text_after_end']);
  });

  it('flags a session that never delivered', () => {
    expect(scoreSession([{ type: 'session.status_running', processed_at: at(0) }]).flags).toEqual([
      'no_delivery',
      'no_end',
    ]);
  });

  // 2026-11-27: refused reports counted, stills went uncounted, and a two-update round was flagged.
  it('counts accepted reports, stills captures, the longest silence and text after the end reply', () => {
    const use = (second, name, id, input = {}) => ({ ...mcp(second, name, input), id });
    const result = (second, id, content, isError = false) => ({
      type: 'agent.mcp_tool_result',
      processed_at: at(second),
      mcp_tool_use_id: id,
      is_error: isError,
      content: [{ type: 'text', text: content }],
    });
    const say = (second, text) => ({ type: 'agent.message', processed_at: at(second), content: [{ text }] });
    const base = [
      { type: 'session.status_running', processed_at: at(0) },
      use(5, 'report_progress', 'p1'),
      result(6, 'p1', '{"ok":true}'),
      use(7, 'report_progress', 'p2'),
      result(8, 'p2', '{"error":"rejected"}'),
      bash(10, 'timeout 300 npm run --silent capture -- x --stills --out /tmp/a'),
      use(20, 'report_progress', 'p3'),
      result(21, 'p3', '{"ok":true}'),
      use(30, 'submit_sources', 's1'),
      result(31, 's1', '{"accepted":true}'),
      use(32, 'end', 'e1', { summary: 'Done.' }),
      say(33, 'Ending.'),
      result(34, 'e1', '{"ok":true,"ended":true}'),
    ];
    const quiet = scoreSession([...base, { type: 'session.status_idle', processed_at: at(35) }]);
    expect(quiet.calls).toMatchObject({ progressReports: 2, captures: 1, replays: 0 });
    expect(quiet.seconds.longestProgressGap).toBe(15);
    expect(quiet.flags).toEqual([]);

    const chatty = scoreSession([...base, say(36, 'Here is a recap of the round.')]);
    expect(chatty.flags).toEqual(['text_after_end']);
  });
});
