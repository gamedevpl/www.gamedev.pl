# CLI conversational assistant

Every natural-language REPL message goes to `POST /api/cli/chat`, before and after a
game exists. The binary holds no model keys. The existing server-side intake model
(OpenRouter Gemini 3.5 Flash Lite, with Vertex fallback and `CLI_CHAT_MODEL` override)
interprets the message using conversation history, the creator's shelf and CLI context.
Slash commands such as `/play` bypass the model and remain available during chat outages.

The client sends its active submission token, optional checkout slug and installed agent
names. The server verifies the token and ownership, resolves the game's state and builder,
and gives the model only that context. Local paths, tokens and credentials are not included
in the model prompt. A checkout slug that disagrees with the submission is rejected.

The model can reply, ask a clarification, propose a new game through `create_game`, or
request one of three separate tools (`play_game`, `game_status`, `edit_game`). Each
tool advertises only its own required arguments and maps to the existing CLI action
format:

- `play` with a known slug opens the local checkout with live reload when it matches;
  otherwise it opens the remote game. Published state does not prevent playing.
- `status` reads the active submission and prints its current status.
- `edit` carries the full agreed task (up to 2000 characters), resolving short confirmations
  from conversation history. It uses the existing revision flow, retaining
  builder selection, handoff, verification and delivery controls. For published games,
  the CLI calls `/improve` with the chosen builder and follows the new round token; it
  does not send edits to the closed published round.

Both the API and CLI validate the closed action vocabulary. There is no shell-command,
filesystem-path or arbitrary-URL action. Multiple tool calls, unknown targets, malformed
arguments and provider failures fail closed to a reply; they never fall back to a build.
The model requests an action rather than claiming it has completed. History records that
request; execution errors are displayed by the CLI. Ambiguous or mixed requests should
produce a clarification.

Existing clients without the optional session field retain the pre-game reply/create
protocol. Deploy the API before releasing the corresponding CLI. Chat authentication,
moderation, rate limits, daily quota and account-deletion handling remain shared with intake.
The existing `play_requested` and build funnel events are emitted by actual CLI execution;
server logs record action names without prompt contents or local paths.

Tests use injected provider responses to exercise tool selection boundaries, ownership,
prompt context, and client execution without spending model quota. They do not establish
language-model accuracy; a live-provider evaluation is separate from these deterministic
regressions.
