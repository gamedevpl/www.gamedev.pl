# CLI pre-job intake

The REPL talks to a **server-side intake agent** before a game exists. The `gamedevpl`
binary never holds model keys.

1. `POST /api/cli/chat` — a cheap model (OpenRouter Gemini Flash Lite by default, Vertex
   Flash Lite if that key is missing) with the last few turns of this creator's conversation.
2. A `reply` is just talk. A `create` calls the same `createGame` path Studio and MCP use,
   then `POST /api/submissions/:token/turn` takes over.

The agent is **fail-closed**: a timeout or provider error is a conversational reply, never
a new game. Greetings and questions must not mint a submission.

`gamedevpl create` is not a REPL path; this file is about typing into the open prompt.
The conversation document (`cliChats/{uid}`) is erased with the account.
