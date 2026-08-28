# CLI status polling

A non-browser client watches a round through the same status read Studio uses:
`GET /api/submissions/:token` (class-A, cookie / PAT / `creator`-scoped OAuth).
One response carries the fields a terminal needs; there is no second status API.

## Fields

| Field              | Meaning                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `gateProgress`     | Live gate milestones (`lane`, `stage`, `index`, `total`, `at`) while a gate is running. Cleared once a verdict lands. |
| `previewGate`      | Latest preview verdict (`green`, `ranAt`, optional `report` / `status`).                                              |
| `preview.slug`     | Playable draft exists. Open it at `/play/<slug>` on the same origin; the wire does not send a full URL.               |
| `stall`            | Why the round looks stuck (`no_agent_yet`, `ended`, `quiet`, gate/session crash). Absent means progressing.           |
| `failure`          | Terminal bounce (`reason`, e.g. `gate_red`).                                                                          |
| `status` / `phase` | Public status and finer job phase.                                                                                    |
| `events`           | Live channel updates, newest first.                                                                                   |

`gateProgress` is present only while the gate is in flight (`native-job-status.ts`). After a verdict, read `previewGate` (preview lane) or treat `status` / `failure` as the publish-lane outcome.

## Cadence

Match `apps/web/src/studioStatusPoll.ts`:

- **3s** while the round is active (`status === 'building'`, `phase === 'dispatched'`, or stall `no_agent_yet` / `ended` / `quiet`).
- **10s** when idle, including `needs_changes` (a later turn can start another round).
- **Stop** on `published` or `abandoned`.

Honor `429` with backoff. The server caches the GitHub-derived slice for up to 60s (`dispatched` for 2s); channel events attach outside that cache, so a 3s poll still sees fresh `events` / presence.

Do not invent a second watch endpoint. Bounded `--watch` in the CLI should use this read and this cadence.
