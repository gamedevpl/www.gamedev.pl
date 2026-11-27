// Scores one managed-agent session export (the session-events JSON array).

const seconds = (from, to) => (from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 1000) : null);
// 2026-11-27: a creator watching Studio sees a silent round after two minutes.
const PROGRESS_GAP_SECONDS = 120;
const LOSS = /^(lost|lose|loss|dead|died|defeat|defeated|fail|failed|game[-_ ]?over)$/i;

function toolCalls(events) {
  return events
    .filter((event) => event.type === 'agent.tool_use' || event.type === 'agent.mcp_tool_use')
    .map((event) => ({
      id: event.id,
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
  // Stills captures (`npm run capture -- <slug> --stills`) are captures too.
  const captures = shell.filter(
    (call) => call.command.includes('--replay') || /\bcapture\b.*--stills/.test(call.command),
  );
  const results = new Map(
    events
      .filter((event) => event.type === 'agent.mcp_tool_result' && event.mcp_tool_use_id)
      .map((event) => [event.mcp_tool_use_id, event]),
  );
  const succeeded = (call) => {
    const result = results.get(call.id);
    if (!result) return !call.id; // Older exports carry no ids; count the call.
    return (
      !result.is_error &&
      !/"(error|rejected)"\s*:/.test((result.content ?? []).map((part) => String(part?.text ?? '')).join('\n'))
    );
  };
  const submits = mcp('submit_sources');
  const end = mcp('end').at(-1);
  const between = (from, to) =>
    requests
      .filter((request) => from && to && request.processed_at >= from && request.processed_at <= to)
      .reduce((sum, request) => sum + (request.model_usage?.cache_read_input_tokens ?? 0), 0);
  const cacheRead = requests.reduce((sum, request) => sum + (request.model_usage?.cache_read_input_tokens ?? 0), 0);
  const replayCacheRead = between(replays[0]?.at, replays.at(-1)?.at);
  // Text after end's reply, not its call: the acknowledgement is where the round is over.
  const endAck = (end && results.get(end.id)?.processed_at) ?? end?.at;
  const textAfterEnd = endAck
    ? events.some(
        (event) =>
          event.type === 'agent.message' &&
          event.processed_at > endAck &&
          (event.content ?? []).some((part) => String(part?.text ?? '').trim().length > 0),
      )
    : false;
  const reports = mcp('report_progress').filter(succeeded);
  const progress = reports.length;
  // Longest stretch the creator saw no update: start, each accepted report, then end.
  const marks = [startedAt, ...reports.map((call) => call.at), end?.at ?? endedAt].filter(Boolean);
  const longestProgressGap =
    marks.length > 1 ? Math.max(...marks.slice(1).map((mark, i) => seconds(marks[i], mark))) : null;
  const noteReads = mcp('creator_notes').filter((call) => !('notes' in call.input)).length;
  const lossObjective = acceptanceNamesLoss(calls);
  const summary = String(end?.input.summary ?? '');

  const flags = [
    ...(submits.length === 0 ? ['no_delivery'] : []),
    ...(!end ? ['no_end'] : []),
    ...(lossObjective ? ['acceptance_names_loss'] : []),
    ...(/win[^.;]*not (verified|scripted|reached)|loss only/i.test(summary) ? ['win_not_reached'] : []),
    ...(submits.length > 0 && progress === 0 ? ['no_progress_report'] : []),
    ...(submits.length > 0 && longestProgressGap > PROGRESS_GAP_SECONDS ? ['progress_gap'] : []),
    ...(mcp('start').length > 1 ? ['repeated_start'] : []),
    ...(noteReads > 1 ? ['repeated_notes_read'] : []),
    ...(captures.length > 6 ? ['capture_thrash'] : []),
    ...(textAfterEnd ? ['text_after_end'] : []),
  ];

  return {
    seconds: {
      total: seconds(startedAt, endedAt),
      toFirstEdit: seconds(startedAt, firstEdit?.at),
      toFirstSubmit: seconds(startedAt, submits[0]?.at),
      replayPhase: seconds(replays[0]?.at, replays.at(-1)?.at),
      longestProgressGap,
    },
    calls: {
      modelRequests: requests.length,
      tools: calls.length,
      replays: replays.length,
      captures: captures.length,
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
