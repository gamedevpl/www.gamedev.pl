// Scores one managed-agent session export (the session-events JSON array).

const seconds = (from, to) => (from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 1000) : null);
const LOSS = /^(lost|lose|loss|dead|died|defeat|defeated|fail|failed|game[-_ ]?over)$/i;

function toolCalls(events) {
  return events
    .filter((event) => event.type === 'agent.tool_use' || event.type === 'agent.mcp_tool_use')
    .map((event) => ({
      at: event.processed_at,
      mcp: event.type === 'agent.mcp_tool_use',
      name: String(event.name ?? ''),
      input: event.input && typeof event.input === 'object' ? event.input : {},
    }));
}

function acceptanceNamesLoss(calls) {
  const write = calls.findLast(
    (call) => call.name === 'write' && String(call.input.file_path).endsWith('/ACCEPTANCE.json'),
  );
  if (!write) return null;
  try {
    const achieved = JSON.parse(String(write.input.content)).achieved;
    return Array.isArray(achieved) && achieved.length > 0 && achieved.every((item) => LOSS.test(String(item?.equals)));
  } catch {
    return null;
  }
}

export function scoreSession(events) {
  const calls = toolCalls(events);
  const mcp = (name) => calls.filter((call) => call.mcp && call.name === name);
  const shell = calls
    .filter((call) => !call.mcp && call.name === 'bash')
    .map((call) => ({ ...call, command: String(call.input.command ?? '') }));
  const requests = events.filter((event) => event.type === 'span.model_request_end');
  const usage = events.findLast((event) => event.type === 'session.usage')?.usage ?? {};
  const startedAt = events[0]?.processed_at;
  const endedAt = events.at(-1)?.processed_at;
  const firstEdit = calls.find((call) => !call.mcp && (call.name === 'write' || call.name === 'edit'));
  const replays = shell.filter((call) => call.command.includes('--replay'));
  const submits = mcp('submit_sources');
  const end = mcp('end').at(-1);
  const between = (from, to) =>
    requests
      .filter((request) => from && to && request.processed_at >= from && request.processed_at <= to)
      .reduce((sum, request) => sum + (request.model_usage?.cache_read_input_tokens ?? 0), 0);
  const cacheRead = requests.reduce((sum, request) => sum + (request.model_usage?.cache_read_input_tokens ?? 0), 0);
  const replayCacheRead = between(replays[0]?.at, replays.at(-1)?.at);
  const textAfterEnd = end
    ? events.some(
        (event) =>
          event.type === 'agent.message' &&
          event.processed_at > end.at &&
          JSON.stringify(event.content ?? '').length > 40,
      )
    : false;
  const progress = mcp('report_progress').length;
  const noteReads = mcp('creator_notes').filter((call) => !('notes' in call.input)).length;
  const lossObjective = acceptanceNamesLoss(calls);
  const summary = String(end?.input.summary ?? '');

  const flags = [
    ...(submits.length === 0 ? ['no_delivery'] : []),
    ...(!end ? ['no_end'] : []),
    ...(lossObjective ? ['acceptance_names_loss'] : []),
    ...(/win[^.;]*not (verified|scripted|reached)|loss only/i.test(summary) ? ['win_not_reached'] : []),
    ...(progress < 4 ? ['few_progress_reports'] : []),
    ...(mcp('start').length > 1 ? ['repeated_start'] : []),
    ...(noteReads > 1 ? ['repeated_notes_read'] : []),
    ...(replays.length > 6 ? ['capture_thrash'] : []),
    ...(textAfterEnd ? ['text_after_end'] : []),
  ];

  return {
    seconds: {
      total: seconds(startedAt, endedAt),
      toFirstEdit: seconds(startedAt, firstEdit?.at),
      toFirstSubmit: seconds(startedAt, submits[0]?.at),
      replayPhase: seconds(replays[0]?.at, replays.at(-1)?.at),
    },
    calls: {
      modelRequests: requests.length,
      tools: calls.length,
      replays: replays.length,
      submits: submits.length,
      starts: mcp('start').length,
      progressReports: progress,
      notesReads: noteReads,
    },
    tokens: {
      cacheRead,
      cacheWrite: requests.reduce((sum, request) => sum + (request.model_usage?.cache_creation_input_tokens ?? 0), 0),
      output: requests.reduce((sum, request) => sum + (request.model_usage?.output_tokens ?? 0), 0),
      firstRequestPrefix: requests[0]?.model_usage?.cache_creation_input_tokens ?? null,
      replayPhaseCacheReadShare: cacheRead ? Math.round((replayCacheRead / cacheRead) * 100) / 100 : null,
    },
    // The export gives the amount without a unit; cents fit the token counts.
    listCost: usage.list_cost?.amount ?? null,
    flags,
  };
}
