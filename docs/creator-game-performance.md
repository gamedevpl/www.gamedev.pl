# Production performance for creators

Published-game owners can read device-specific performance in Studio's Statistics
section and through the `get_game_performance` MCP tool. Both use one bounded,
cache-backed service. Existing transport and telemetry partitions remain the source.

## MCP

Connect with an existing creator key or OAuth access with the `mcp` scope. No build
round, `start`, write, or new game is needed. Use `list_account_games` to find a slug:

```json
{ "slug": "space-hop", "days": 7, "performanceReviewers": "include" }
```

`days` is an integer from 1 to 30, default 7. `performanceReviewers` is `include`
(default), `exclude`, or `only`. An optional `artifactVersion` is the exact 64-character
SHA-256 from `availableVersions`; it identifies served HTML, not a git commit.
Only the current creator owner can read. Editors, unrelated accounts, retired game
keys and round session keys cannot use this account read. Creator-key rotation,
OAuth revocation and transfers retain their existing authorization boundaries.

Successful replies return structured data and JSON text with the same content:

- `groups`: build, coarse device/browser/system, screen size, viewport and canvas
  CSS/buffer size, iframe/display DPR, CPU/RAM buckets, state/backend/orientation,
  reviewer cohort, rAF/rendered FPS, histogram bounds and gap counts.
- `measuredSessions`, `unmeasuredSessions`, sample windows and observed duration.
- `status`: `no_traffic`, `no_valid_windows`, or `measured` for selected filters.
- `invalidWindows`, `agentEventsExcluded`, `aliveWithoutPerformance`.
- UTC `days`, `measuredAt`, `freshUntil`, and scan/group/version truncation flags.
- `availableVersions`, `totalGroups`; groups and versions each cap at 100.

Responses contain aggregates only: no raw rows, session IDs, UID or IP. No matching
traffic, unsupported legacy frame data and invalid windows must not be interpreted
as zero FPS. Active-agent events are retained in storage but excluded from FPS.
Reviewer groups remain separate; the performance filter does not change engagement
metrics. Unknown devices/builds remain unknown.

Tool refusals use `isError` and `structuredContent.code`: `opener_required`,
`invalid_arguments`, `not_owner`, `not_published`, or `rate_limited`. A limited read
includes `retryAfterSeconds`. A successful read does not authorize game optimization.

## Studio and HTTP

Open Statistics on an owned, live published game. The existing 1d/7d/30d selector
also selects the performance window. Cohort/build filters and expandable groups
show the same measurements as MCP, in Polish or English. Loading, read failures,
missing samples and incomplete scans are explicit. Errors do not display stale data.

The authenticated owner endpoint is:

`GET /api/me/studio/performance?slug=space-hop&days=7&performanceReviewers=include`

It returns 401 without an authenticated account, 404 for inaccessible/non-published
games, 400 for invalid parameters, and 429 with `Retry-After` for scan-budget exhaustion.

## Read limits and freshness

Each cold window scans only one authorized slug: at most 30 daily queries,
1000 rows per day and 5000 rows per request, newest UTC days first. The existing
Studio scan budget is shared with this feature: 30 cache misses per account/hour.
The 10-minute cache is shared across MCP/HTTP and across reviewer/build filters;
in-flight identical scans coalesce. At most 50 raw windows stay in process memory.
Ownership is checked before cache access and again after a scan, independent of
cached aggregates; access revision participates in the cache key. Credentials are
verified on every call. Narrowing a filter cannot restore rows dropped by a bounded
scan. Use shorter periods if `scanTruncated` is true.

FPS measures iframe rAF cadence, with an optional GameKit presented-frame counter.
It is not GPU time or proof that pixels changed. Percentiles are upper bounds from
histograms. Devices are coarse browser classifications; physical phone performance
cannot be inferred from desktop mobile emulation. One session is a lead, not a
hardware-wide conclusion. See [measurement contract](frame-performance-telemetry.md).
