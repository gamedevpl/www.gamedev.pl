# CLI pre-job intake

For the first CLI milestone, refine → submit stays **client-side**. The `gamedevpl` binary
drives the existing create routes itself:

1. `POST /api/submissions/refine` — clarifying questions (same flow as Studio).
2. `POST /api/submissions` — freeze the spec and open the first round.

There is no pre-job mini-agent scope and no new intake endpoint. Conversational
`POST /api/submissions/:token/turn` starts only after a submission token exists.

A later milestone may reconsider a server-side intake agent; this file is the
decision that M1 will not add one.
