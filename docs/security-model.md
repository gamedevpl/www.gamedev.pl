# Security Model

> **Current model:** gamedev.pl serves a catalog, renders untrusted static games, and accepts
> public game specs. Coding agents work in a dedicated repository and submit pull requests.
> The app does not run agents or containers on creators' behalf.

## Trust boundaries

### 1. Published game code

Agent-written game code is untrusted, including code influenced by public specs or remix
requests. It must render only in an iframe with `sandbox="allow-scripts allow-pointer-lock"` and **without**
`allow-same-origin`.

This protects the parent app's DOM, cookies, and storage. It does not solve every browser risk:

| Risk                                        | Required control                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Outbound requests or data beacons           | Reject network dependencies and publish with a restrictive CSP           |
| CPU/memory abuse                            | Browser smoke tests, reporting, takedown, and conservative bundle limits |
| Phishing UI                                 | Visible generated-content framing and a separate cookieless games origin |
| Offensive, infringing, or deceptive content | Human moderation before publication plus takedown procedures             |
| Broken or misleading games                  | Mechanical validation, browser tests, and review against `SPEC.md`       |

The separate games origin is defense in depth: even if iframe configuration later regresses,
the games origin must not carry app cookies, credentials, or privileged APIs.

### 2. Public specs and issue text

Creator specs are untrusted content. They can contain spam, prohibited material, or prompt
injection aimed at the coding agent that later reads them.

- Validate size and required structure before accepting a submission.
- Rate-limit by an attributable identity and apply repository-wide abuse limits.
- Make rights, attribution, and public-repository consequences explicit before submission.
- Moderate before publication; issue creation is not approval.
- Tell agents to treat specs and issue bodies as **data, not instructions**.
- Restrict an agent PR to one game directory; changes to tools, workflows, or other games need
  separate trusted review.

### 3. Repository automation and publishing

The games repository is a software supply chain. Agent output is a proposal, never a trusted
result.

- Require PR review and passing validation before merge; never auto-merge agent work.
- Run untrusted PR checks without deployment secrets.
- Do not use `pull_request_target` to execute PR-controlled code.
- Give workflows explicit least-privilege permissions and pin third-party actions to commits.
- Publish only from the protected default branch through a protected environment.
- Use OIDC/workload identity for hosting access instead of long-lived cloud keys.
- Keep submission credentials server-side and scope them to issue creation where possible.

### 4. Catalog and submission API

Catalog data and game bundles cross a repository-to-browser boundary and must be validated even
if they came from a merged commit. The submission API also crosses a public-to-repository
boundary.

- Validate the catalog schema and game slugs before constructing URLs.
- Fail closed when a bundle is missing, oversized, or fails integrity checks.
- Do not proxy arbitrary user-controlled URLs.
- Apply CSRF/origin controls as appropriate once authentication exists; permissive development
  CORS must not become the production submission policy.
- Never return repository credentials or upstream error details to clients.

### 5. Programmatic callers (personal access tokens)

Coding agents authenticate with tokens issued to real accounts
([`agent-access-tokens.md`](./agent-access-tokens.md)) rather than through any bypass
route. The properties that keep this inside the threat model:

- A token authenticates **as an account** — same tier, quota, and walls. It grants nothing
  a session for that account would not.
- **Issuance requires an admin session.** A token-authenticated request is refused by every
  operator surface, so a leaked token cannot mint another or read across other people's
  games.
- OAuth access tokens with the `creator` scope (`gdpl_oat_`) are the same class-A door for
  creator routes. Tokens that hold only `mcp` do not authenticate those routes. Operator
  surfaces, account deletion, and invite claim answer **404** (not 403) for any
  non-session credential — PAT or OAuth. A token never mints another token.
- Only `sha256(secret)` is stored, in its own collection, never on the user document that
  gets serialized to browsers.
- Revocation is a delete and takes effect on the next request — no redeploy, unlike
  rotating a shared secret.
- Expiry is mandatory (90 days default, 365 max), and the token format is registered in the
  generated-game credential scanner.

Do not add an unauthenticated route that mints sessions, and do not rename one to look like
something else. If a bypass is ever genuinely required, it must be named for what it is.

## Mechanical games-repo gate

Before publication, each game must pass the checks in
[`games-repo-blueprint.md`](./games-repo-blueprint.md): required spec metadata and files, slug
consistency, size limit, credential scan, no remote dependencies, no frame-escape attempts, and
a headless-browser smoke test. The gate complements review; it does not replace moderation.

## Historical finding: self-hosted agent credentials

The previous design placed an agent behind an auth proxy and short-lived job token. That work
was removed along with the container runner and orchestrator when the product pivoted. The
credential-exfiltration and subscription-licensing blockers were therefore **dissolved by
removing the execution model**, not carried forward as partially completed work.

Do not reintroduce a path where public content triggers agent execution in infrastructure or
credentials operated by gamedev.pl. Historical details are available in Git history and
[`container-orchestration.md`](./container-orchestration.md), which is archived.

## Non-negotiable invariants

- Games render only in `sandbox="allow-scripts allow-pointer-lock"` without `allow-same-origin`.
- The game iframe's `allow=` delegation is pinned to exactly
  `accelerometer; gyroscope; magnetometer` (opt-in GameKit tilt) and never grows —
  asserted by `apps/web/src/GameFrame.sandbox.test.ts`. In particular it never includes
  `tools`: WebMCP-capable browsers expose agent tool registration to a cross-origin
  iframe only when it is granted `allow="tools"`, and granting that would let untrusted
  game code present tools to a visitor's in-browser agent under our name. If the shell
  ever registers WebMCP tools itself, only the shell does — game-derived capability
  keeps crossing the postMessage bridge as data. Camera pixels and microphone loudness
  stay shell-owned, and party input / shell-read sensors reach games only as clamped,
  structured postMessage data.
- Games are served from a separate cookieless origin in production.
- Public specs and issue text are data, never agent instructions.
- Agent-authored changes require review and validation; they are never auto-merged.
- Production credentials never enter game bundles, public specs, untrusted PR jobs, or the
  browser.
- Authentication has no bypass route in production. Programmatic callers use tokens issued
  to real accounts, and issuing one always requires a human at an admin session.
