# agent-runner

A minimal, self-contained container that runs **one game-generation job** and
exits, emitting a **`GameProject`** (real `html` + `js` + `css`, matching
[`packages/game-generator/src/types.ts`](../../packages/game-generator/src/types.ts))
as JSON. It is the first concrete building block of the container-orchestration
direction — the [`ContainerGameGenerator`](../../packages/game-generator/src/container.ts)
shells out to `docker run` this image and parses its output.

> **Default path proves the whole pipeline with ZERO tokens and ZERO network.**
> `AGENT_MODE=mock` (the default) deterministically fills an on-disk game
> template and needs no external model, so `docker build` + `docker run` work
> fully offline. This is the primary thing this slice exists to prove.

For the broader orchestration design (queue, scale-to-zero, teardown) see
[`docs/container-orchestration.md`](../../docs/container-orchestration.md).

## Agent-agnostic by design — read the ToS blockers first ⚠️

Which agent/CLI/auth runs inside this container is a **runtime concern injected
via env vars, never hardcoded**. `AGENT_MODE=external` is a **pluggable seam**:
you supply the executable via `AGENT_CMD`, and the runner does the generic
copy-template → run-agent → collect-result flow around it. Nothing
provider-specific is baked in.

**`AGENT_CMD` is unset by default, and external mode refuses to run without it** —
so out of the box nothing executes, nothing reaches the network, and nothing can
cost money. That is the safety gate.

That gate is technical, not legal. Running an individual Pro/Max **subscription
coding CLI as always-on multi-tenant backend compute**, or **rotating accounts**
to dodge rate limits, are **unresolved Terms-of-Service blockers** — see
[`docs/risks-and-open-questions.md`](../../docs/risks-and-open-questions.md)
(B1/B2). Nothing here assumes those are licensed; deciding what you are allowed
to put in `AGENT_CMD` is on you.

## Contract

**Input** — environment variables:

| Var           | Default                  | Meaning                                                           |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| `AGENT_MODE`  | `mock`                   | `mock` (offline, deterministic) or `external` (runs `AGENT_CMD`). |
| `PROMPT`      | `""`                     | The natural-language prompt.                                      |
| `OUTPUT_PATH` | `/out/game-project.json` | Where the JSON file is also written, if that dir is writable.     |

External mode only (all ignored in `mock`):

| Var                | Default   | Meaning                                                                                                                                                                         |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_CMD`        | **unset** | The coding-agent executable to run (`claude`, `codex`, `agy`, a script…). **Required** — external mode exits non-zero with an explanatory message if unset.                     |
| `AGENT_ARGS`       | `[]`      | Optional **JSON array of strings** passed as argv, e.g. `'["--print","--permission-mode","acceptEdits"]'`. Malformed JSON, or a non-array-of-strings, fails with a clear error. |
| `AGENT_TIMEOUT_MS` | `600000`  | Wall-clock budget. On expiry the child is `SIGKILL`ed and the run fails.                                                                                                        |
| `AGENT_PROMPT_ENV` | `PROMPT`  | Name of the env var the prompt is exposed to the agent under.                                                                                                                   |
| `AGENT_WORK_DIR`   | temp dir  | Explicit working dir instead of a fresh `mkdtemp` one.                                                                                                                          |

**Output** — a `GameProject` as JSON:

- to **stdout** (clean — all logs go to stderr), the primary contract, and
- to **`OUTPUT_PATH`** as a file when that directory is writable.

```json
{ "title": "...", "description": "...", "html": "...", "js": "...", "css": "..." }
```

## How `AGENT_MODE=external` works

1. **Copy** — `template/` is copied into a fresh working dir (`mkdtemp`, or
   `AGENT_WORK_DIR`). The agent edits that scratch copy; the image's template
   stays pristine.
2. **Run** — `AGENT_CMD` is spawned with `AGENT_ARGS` as an **argv array, never a
   shell string**, so the prompt cannot inject. `cwd` is the working dir. The
   prompt is delivered **both** ways, so most CLIs work unmodified:
   - in the env var named by `AGENT_PROMPT_ENV` (default `PROMPT`), and
   - written to the agent's **stdin**, which is then closed.

   `AGENT_WORK_DIR` is also exported into the child env, pointing at the working
   dir. The child's **stdout and stderr are both wired to our stderr** — an agent
   can never contaminate the JSON on our stdout.

3. **Collect** — after a clean exit the runner reads `index.html`, `game.js` and
   `style.css` from the working dir root. `title`/`description` come from the
   `#game-title` / `#game-desc` elements in `index.html` if the agent filled
   them, otherwise they are derived from the prompt; any `__TITLE__` /
   `__DESCRIPTION__` slots the agent left behind are then substituted, so the
   emitted project never contains placeholders.
4. **Fail loudly** — non-zero agent exit (error names the exit code), timeout,
   spawn failure, or missing/empty `index.html`/`game.js` (error names exactly
   which files) each exit non-zero with the reason on stderr.

The agent's only contract is therefore: _leave `index.html`, `game.js` and
`style.css` in your cwd_.

## Build

```sh
docker build -t gamedevpl/agent-runner containers/agent-runner
```

## Run (mock mode — copy-paste)

Capture the `GameProject` from stdout. No network, no tokens:

```sh
docker run --rm --network none \
  -e AGENT_MODE=mock \
  -e PROMPT="a tiny dodge-the-blocks game" \
  gamedevpl/agent-runner > game-project.json

cat game-project.json
```

This is exactly what `ContainerGameGenerator.generate()` does under the hood
(minus the redirect — it reads stdout directly).

To also get the file artifact, mount a writable dir at `/out`:

```sh
mkdir -p out && chmod 777 out
docker run --rm --network none \
  -e AGENT_MODE=mock -e PROMPT="a space shooter" \
  -v "$PWD/out:/out" \
  gamedevpl/agent-runner > /dev/null
cat out/game-project.json
```

## Run (external mode)

With no `AGENT_CMD`, external mode refuses to run — the safe default:

```sh
docker run --rm -e AGENT_MODE=external gamedevpl/agent-runner
# exits non-zero: "AGENT_MODE=external requires AGENT_CMD ..."
```

### Copy-pasteable example: a zero-cost fake agent

Any executable that leaves the three files in its cwd works. This one proves the
copy → run → collect flow end-to-end without a model, a network, or a token:

```sh
mkdir -p fake && cat > fake/agent.sh <<'EOF'
#!/bin/sh
# $PROMPT (name configurable via AGENT_PROMPT_ENV) also arrives on stdin.
echo "agent: cwd=$(pwd) prompt=[$PROMPT]" >&2
sed -i "s/__TITLE__/Neon Dodger/; s/__DESCRIPTION__/A neon arcade dodger./" index.html
echo "// tweaked by the agent" >> game.js
echo "body { background: #000; }" >> style.css
EOF
chmod +x fake/agent.sh

docker run --rm --network none \
  -e AGENT_MODE=external \
  -e AGENT_CMD=/agent/agent.sh \
  -e AGENT_ARGS='["--yes"]' \
  -e AGENT_TIMEOUT_MS=60000 \
  -e PROMPT="a neon dodge game" \
  -v "$PWD/fake:/agent:ro" \
  gamedevpl/agent-runner > game-project.json
```

The same thing without docker (the image entrypoint is literally
`node /app/runner.mjs`):

```sh
AGENT_MODE=external AGENT_CMD="$PWD/fake/agent.sh" AGENT_ARGS='["--yes"]' \
  PROMPT="a neon dodge game" OUTPUT_PATH=/tmp/game-project.json \
  node containers/agent-runner/runner.mjs > game-project.json
```

### With a real coding CLI — Claude Code

> 💸 **Everything below spends real money per run.** Nothing here happens unless you
> explicitly set `AGENT_CMD` and supply a credential.

The image ships the Claude Code CLI (`@anthropic-ai/claude-code`, binary `claude`),
installed as root so it is on `PATH` for the non-root `agent` user. Nothing is
authenticated at build time — no key is baked into the image.

```sh
docker run --rm \
  -e AGENT_MODE=external \
  -e AGENT_CMD=claude \
  -e AGENT_ARGS='["-p","--permission-mode","acceptEdits"]' \
  -e ANTHROPIC_API_KEY \
  -e PROMPT="a game where you dodge falling rocks" \
  gamedevpl/agent-runner > game-project.json
```

Why each part matters:

- **`-p`** runs Claude Code headless (one-shot, non-interactive). The runner feeds
  the prompt on **stdin**, which `-p` reads, so no positional prompt arg is needed.
- **`--permission-mode acceptEdits`** is the crux: it auto-approves file edits, so
  the agent can actually rewrite `index.html` / `game.js` / `style.css` in its
  working copy without an interactive approval prompt. Without it the run stalls
  or changes nothing. (`bypassPermissions` also exists and disables _all_ safety
  checks — deliberately not used here.)
- **`-e ANTHROPIC_API_KEY`** — note the **name only, no `=value`**. Docker reads the
  value from your environment, so the secret never lands in the command line or the
  process list. `ContainerGameGenerator` forwards credentials the same way.
- **No `--network none`** — unlike mock mode, a real agent must reach the model API.

Auth: `ANTHROPIC_API_KEY` is the simplest path and needs no prior interactive login.
The image sets a writable `HOME` (the CLI creates `~/.claude` on first run) and
`DISABLE_AUTOUPDATER=1`, since self-updating in an ephemeral container is pointless.

Other CLIs work the same way — set `AGENT_CMD` to the executable and put its
non-interactive flags in `AGENT_ARGS`. Re-read the ToS caveats above (B1/B2) before
running a subscription CLI as backend compute.

## Files

| File            | Purpose                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`    | Slim Node 20 image, non-root `agent` user, no build step.                                                                                                                         |
| `runner.mjs`    | Dependency-free ESM entrypoint implementing the contract above.                                                                                                                   |
| `template/`     | The pristine game template (`index.html` / `game.js` / `style.css`) with `__TITLE__` / `__DESCRIPTION__` slots. Copied into a scratch working dir per run; never edited in place. |
| `.dockerignore` | Keeps the build context small.                                                                                                                                                    |

## Security posture

- **Non-root** — the job runs as the unprivileged `agent` user (enforced here).
- **Ephemeral** — one job per `docker run --rm`, then gone.
- **No network needed** — mock mode runs fine with `--network none`; use it so
  generated/agent code can't call out.
- **No secrets in the image** — any agent auth is injected at run time, never
  baked into a layer.
- **Off by default** — external mode needs an explicit `AGENT_CMD`; unconfigured,
  the container cannot execute a third-party agent or spend anything.
- **No shell interpolation** — the agent is spawned with an argv array
  (`shell: false`), so a hostile prompt cannot become a command.
- **Scratch working copy** — the agent only ever edits a temp copy of the
  template inside the ephemeral container.
- **Bounded** — `AGENT_TIMEOUT_MS` (default 10 min) kills a hung agent. Note it
  signals the direct child only; use container-level limits for hard isolation.
