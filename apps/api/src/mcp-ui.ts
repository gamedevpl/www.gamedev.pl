import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * MCP Apps (SEP-1865, extension `io.modelcontextprotocol/ui`).
 *
 * One `ui://` view — the round card — which the host renders inside the conversation.
 * It opens from the tool the creator just ran, then keeps itself current by polling
 * `get_round_status`, an app-only tool the model never sees. That is the point: the
 * creator watches the gate without the agent spending tokens and tool-budget to look,
 * which is the busy-poll problem `gate_poll_backoff` exists to paper over.
 *
 * When a host refuses the app-only call, the card falls back to rendering the payload
 * it was opened with rather than showing something broken.
 *
 * Two rules hold this together, and both are load-bearing:
 *
 * 1. **Existing clients must see today's contract byte for byte.** Claude Code, Cursor
 *    and headless agents never declare the extension, so they never get `_meta.ui`, a
 *    `resources` capability, or anything else new. `MCP_UI` gates the whole surface on
 *    top of that.
 * 2. **A view is trusted first-party UI holding a live tool-call bridge.** Game code is
 *    untrusted and must never be served as a `ui://` resource — it would run in the
 *    frame that owns that bridge. Playable-preview views nest the game one iframe
 *    deeper instead (Phase 2); nothing here does that yet.
 *
 * CSP metadata is deliberately omitted from the resource descriptors: the host default
 * is deny-all, which is exactly right for a card that fetches nothing. Declaring
 * `connectDomains` / `frameDomains` is a Phase 2 concern.
 */

/** Extension id hosts advertise in `initialize` and we echo back when we support it. */
export const MCP_UI_EXTENSION = 'io.modelcontextprotocol/ui';

/** The only view content type SEP-1865 defines for its initial release. */
export const MCP_UI_MIME_TYPE = 'text/html;profile=mcp-app';

/** The round card: opened by a tool call, then live from `get_round_status`. */
export const ROUND_STATUS_RESOURCE_URI = 'ui://gamedevpl/round-status';

/**
 * Tools that open the round view. The write tools are here deliberately: the card is
 * where a creator watches the round from, and the moment a delivery is submitted is
 * exactly when they want to. It renders live state from `get_round_status`, not from
 * the opening tool's payload, so opening it mid-delivery shows the build rather than a
 * frozen echo of the call.
 */
export const MCP_UI_TOOL_RESOURCES: Readonly<Record<string, string>> = Object.freeze({
  start: ROUND_STATUS_RESOURCE_URI,
  open_round: ROUND_STATUS_RESOURCE_URI,
  submit_sources: ROUND_STATUS_RESOURCE_URI,
  get_gate_verdict: ROUND_STATUS_RESOURCE_URI,
});

/**
 * Tools the view may call but the model may never see (`visibility: ["app"]`).
 *
 * This is the whole point of the dashboard: the view polls round state itself, so the
 * agent stops paying tokens and tool-budget to find out whether the gate landed — the
 * busy-poll problem `gate_poll_backoff` exists to paper over.
 *
 * Two invariants. They must stay **read-only**: a tool hidden from the model that can
 * write is an audit hole, since nothing in the transcript would record the change. And
 * they must stay **presence-neutral** — a creator idling with the chat open is a human
 * watching, not an agent working, so polls must not refresh the heartbeat, clear
 * `agentEndedAt`, or hold off the quiet stall that unlocks self→platform handoff.
 */
export const MCP_UI_APP_ONLY_TOOLS: ReadonlySet<string> = new Set(['get_round_status']);

/** Off unless explicitly enabled — production stays on today's contract until the spike lands. */
export function mcpUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.MCP_UI ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

/**
 * Canonicalise a media type so `text/html; profile="MCP-App"` and
 * `text/html;profile=mcp-app` compare equal. Media-type parameters allow surrounding
 * whitespace and quoted values, and case only matters inside the value — comparing the
 * raw strings would silently deny views to a client that spelled it legally.
 */
function canonicalMediaType(value: string): string | null {
  const segments = value.split(';');
  const base = (segments.shift() ?? '').trim().toLowerCase();
  if (!base) return null;
  const parameters = segments
    .map((segment) => {
      const separator = segment.indexOf('=');
      if (separator === -1) return null;
      const name = segment.slice(0, separator).trim().toLowerCase();
      let parameterValue = segment.slice(separator + 1).trim();
      if (parameterValue.length >= 2 && parameterValue.startsWith('"') && parameterValue.endsWith('"')) {
        parameterValue = parameterValue.slice(1, -1);
      }
      return name ? `${name}=${parameterValue.toLowerCase()}` : null;
    })
    .filter((parameter): parameter is string => parameter !== null)
    .sort();
  return [base, ...parameters].join(';');
}

const CANONICAL_UI_MIME_TYPE = canonicalMediaType(MCP_UI_MIME_TYPE);

/**
 * Did the client declare the UI extension in `initialize`? A client that declares it
 * but lists mime types we cannot serve counts as not capable; a client that omits
 * `mimeTypes` entirely is taken at its word (the field is optional in practice).
 */
export function clientDeclaresUi(params: unknown): boolean {
  if (!params || typeof params !== 'object') return false;
  const capabilities = (params as { capabilities?: unknown }).capabilities;
  if (!capabilities || typeof capabilities !== 'object') return false;
  const extensions = (capabilities as { extensions?: unknown }).extensions;
  if (!extensions || typeof extensions !== 'object') return false;
  const ui = (extensions as Record<string, unknown>)[MCP_UI_EXTENSION];
  if (!ui || typeof ui !== 'object') return false;
  const mimeTypes = (ui as { mimeTypes?: unknown }).mimeTypes;
  if (mimeTypes === undefined) return true;
  if (!Array.isArray(mimeTypes)) return false;
  return mimeTypes.some((value) => typeof value === 'string' && canonicalMediaType(value) === CANONICAL_UI_MIME_TYPE);
}

/** What we echo in `initialize.capabilities.extensions` for a UI-capable client. */
export function mcpUiServerCapability(): Record<string, unknown> {
  return { [MCP_UI_EXTENSION]: { mimeTypes: [MCP_UI_MIME_TYPE] } };
}

/**
 * Capability travels in the correlator, signed — not in per-instance memory.
 *
 * Phase 0 recorded "did this client negotiate views?" on the in-process transport
 * session map. Cloud Run is multi-instance and clients do not pin to a revision, so a
 * request adopted by another instance read as not capable: `tools/list` would drop
 * `_meta.ui` and `resources/read` would refuse, breaking a view mid-round. Single
 * instance today (`--max-instances 1`) hid it; keying a durable surface off in-memory
 * state does not survive contact with a second container.
 *
 * So `initialize` mints the id with a suffix any instance can verify with the shared
 * secret. Unforgeable (HMAC), stateless, and invisible to clients that never negotiated
 * — their ids are unchanged, and an id without a valid marker is simply not UI-capable.
 */
const UI_MARKER_SEPARATOR = '-u';
const UI_MARKER_BYTES = 10;

function uiMarker(baseId: string, secret: string): string {
  return createHmac('sha256', secret).update(`mcp-ui-capable:${baseId}`).digest('base64url').slice(0, UI_MARKER_BYTES);
}

/** Stamp a freshly minted session id as belonging to a view-capable client. */
export function markSessionIdUiCapable(sessionId: string, secret: string): string {
  return `${sessionId}${UI_MARKER_SEPARATOR}${uiMarker(sessionId, secret)}`;
}

/**
 * Does this correlator carry a valid view-capability marker? Any instance can answer,
 * including one that never saw the `initialize` that minted it.
 */
export function sessionIdIsUiCapable(sessionId: string | null | undefined, secret: string | undefined): boolean {
  if (!sessionId || !secret) return false;
  // Slice from the end rather than searching for the separator: the marker is base64url
  // and may itself contain "-u", so scanning would split in the wrong place.
  const suffixLength = UI_MARKER_SEPARATOR.length + UI_MARKER_BYTES;
  if (sessionId.length <= suffixLength) return false;
  const baseId = sessionId.slice(0, -suffixLength);
  if (sessionId.slice(-suffixLength, -UI_MARKER_BYTES) !== UI_MARKER_SEPARATOR) return false;
  const marker = sessionId.slice(-UI_MARKER_BYTES);
  const expected = uiMarker(baseId, secret);
  const markerBuffer = Buffer.from(marker, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return markerBuffer.length === expectedBuffer.length && timingSafeEqual(markerBuffer, expectedBuffer);
}

interface UiResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
}

/**
 * The round-status card. Self-contained by necessity — the host CSP is `default-src
 * 'none'` with inline script/style allowed, so no external anything, and screenshots
 * would have to arrive as data URIs rather than URLs.
 *
 * Written without template literals or `${}` so it survives being a TS template string
 * unescaped. Colours come from the host's theme variables with gamedev.pl's identity as
 * the fallback, so the card looks native in both a light and a dark client.
 */
const ROUND_STATUS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>gamedev.pl — round</title>
    <style>
      :root {
        color-scheme: light dark;
        --gd-accent: #00e4ac;
        --gd-bg: var(--color-background-secondary, var(--color-background-primary, #1d2123));
        --gd-fg: var(--color-text-primary, #f2f4f5);
        --gd-muted: var(--color-text-secondary, #9aa3a7);
        --gd-border: var(--color-border-primary, rgba(255, 255, 255, 0.12));
        --gd-radius: var(--border-radius-md, 10px);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 12px;
        font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
        background: transparent;
        color: var(--gd-fg);
      }
      .card {
        background: var(--gd-bg);
        border: 1px solid var(--gd-border);
        border-radius: var(--gd-radius);
        padding: 14px 16px;
        max-width: 640px;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
      }
      .brand { font-weight: 600; letter-spacing: -0.01em; }
      .brand .dot { color: var(--gd-accent); }
      .pill {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid currentColor;
        white-space: nowrap;
      }
      .pill-waiting, .pill-pending, .pill-queued, .pill-dispatched { color: var(--gd-muted); }
      .pill-building, .pill-submitted, .pill-gating { color: #6fb3ff; }
      .pill-green, .pill-preview_passed, .pill-published { color: var(--gd-accent); }
      .pill-red, .pill-preview_failed, .pill-failed { color: #ff6b6b; }
      .pill-kit_outdated, .pill-needs_changes { color: #ffb454; }
      .title { margin: 0 0 8px; font-size: 12.5px; color: var(--gd-muted); }
      .summary { margin: 0; font-size: 14px; line-height: 1.5; }
      .note {
        margin: 10px 0 0;
        padding-left: 10px;
        border-left: 2px solid var(--gd-accent);
        font-size: 13px;
        line-height: 1.45;
      }
      .note .when { display: block; margin-top: 2px; font-size: 11.5px; color: var(--gd-muted); }
      .shot {
        margin: 12px 0 0;
        border: 1px solid var(--gd-border);
        border-radius: 8px;
        overflow: hidden;
        line-height: 0;
      }
      /* Cap the frame: a tall screenshot would otherwise push the gate verdict and the
         report off the bottom of an inline card. */
      .shot img { width: 100%; max-height: 240px; object-fit: contain; display: block; background: #0c0e0f; }
      .shot figcaption {
        padding: 6px 8px;
        font-size: 11.5px;
        line-height: 1.3;
        color: var(--gd-muted);
        background: rgba(127, 127, 127, 0.08);
      }
      .meta {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 14px;
        margin: 12px 0 0;
        font-size: 12.5px;
      }
      .meta dt { color: var(--gd-muted); }
      .meta dd { margin: 0; word-break: break-word; }
      .report {
        margin: 12px 0 0;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--gd-border);
        background: rgba(127, 127, 127, 0.08);
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        max-height: 220px;
        overflow: auto;
      }
      .foot { margin: 12px 0 0; font-size: 11.5px; color: var(--gd-muted); }
      .live { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--gd-accent); margin-right: 6px; vertical-align: middle; }
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="head">
        <span class="brand">gamedev<span class="dot">.pl</span></span>
        <span id="pill" class="pill pill-waiting">waiting</span>
      </div>
      <p id="title" class="title" hidden></p>
      <p id="summary" class="summary">Reading round status…</p>
      <blockquote id="note" class="note" hidden></blockquote>
      <figure id="shot" class="shot" hidden><img id="shotImg" alt="Latest frame from the build" /><figcaption id="shotCap"></figcaption></figure>
      <dl id="meta" class="meta"></dl>
      <pre id="report" class="report" hidden></pre>
      <p id="foot" class="foot"></p>
    </main>
    <script>
      (function () {
        'use strict';

        var host = window.parent;
        var nextId = 1;
        var initializeId = null;
        var initialized = false;
        var pendingCalls = {};

        var sessionKey = null;
        var lastShotId = null;
        var live = false;
        var seed = null;
        var stopped = false;
        var timer = null;

        var pill = document.getElementById('pill');
        var titleEl = document.getElementById('title');
        var summary = document.getElementById('summary');
        var noteEl = document.getElementById('note');
        var shotEl = document.getElementById('shot');
        var shotImg = document.getElementById('shotImg');
        var shotCap = document.getElementById('shotCap');
        var metaList = document.getElementById('meta');
        var report = document.getElementById('report');
        var foot = document.getElementById('foot');

        function post(payload) {
          if (!host || host === window) return null;
          host.postMessage(payload, '*');
          return payload.id === undefined ? null : payload.id;
        }

        function request(method, params) {
          var id = nextId++;
          post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
          return id;
        }

        function notify(method, params) {
          post({ jsonrpc: '2.0', method: method, params: params || {} });
        }

        function log(level, text) {
          notify('notifications/message', { level: level, logger: 'gamedevpl-round-status', data: text });
        }

        function reportSize() {
          notify('ui/notifications/size-changed', {
            height: document.documentElement.scrollHeight,
            width: document.documentElement.scrollWidth
          });
        }

        var hostLocale = undefined;
        var hostTimeZone = undefined;

        function applyThemeVariables(variables) {
          if (!variables || typeof variables !== 'object') return;
          var names = Object.keys(variables);
          for (var i = 0; i < names.length; i++) {
            var name = names[i];
            if (name.indexOf('--') !== 0) continue;
            var value = variables[name];
            if (typeof value === 'string') document.documentElement.style.setProperty(name, value);
          }
        }

        function applyHostContext(context) {
          if (!context || typeof context !== 'object') return;
          if (typeof context.theme === 'string') document.documentElement.setAttribute('data-theme', context.theme);
          if (typeof context.locale === 'string') hostLocale = context.locale;
          if (typeof context.timeZone === 'string') hostTimeZone = context.timeZone;
          applyThemeVariables(context.themeVariables || context.theme_variables || context.cssVariables);
        }

        /** Gate timestamps are ISO; show them in the reader's locale and zone. */
        function formatTime(value) {
          if (typeof value !== 'string' || !value) return value;
          var parsed = new Date(value);
          if (isNaN(parsed.getTime())) return value;
          try {
            return parsed.toLocaleString(hostLocale || undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: hostTimeZone || undefined
            });
          } catch (error) {
            return parsed.toISOString();
          }
        }

        function addRow(term, value) {
          if (value === undefined || value === null || value === '') return;
          var dt = document.createElement('dt');
          dt.textContent = term;
          var dd = document.createElement('dd');
          dd.textContent = String(value);
          metaList.appendChild(dt);
          metaList.appendChild(dd);
        }

        /**
         * Hosts differ in how they wrap a tool result, so dig for the payload rather
         * than assuming one shape.
         */
        function unwrap(params, probe) {
          if (!params || typeof params !== 'object') return null;
          var candidates = [
            params.structuredContent,
            params.result && params.result.structuredContent,
            params.toolResult && params.toolResult.structuredContent,
            params.result,
            params
          ];
          for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i] === 'object' && probe(candidates[i])) return candidates[i];
          }
          var content =
            params.content ||
            (params.result && params.result.content) ||
            (params.toolResult && params.toolResult.content);
          if (Array.isArray(content)) {
            for (var j = 0; j < content.length; j++) {
              var part = content[j];
              if (!part || part.type !== 'text' || typeof part.text !== 'string') continue;
              try {
                var parsed = JSON.parse(part.text);
                if (parsed && typeof parsed === 'object' && probe(parsed)) return parsed;
              } catch (error) {
                /* not our JSON body — keep looking */
              }
            }
          }
          return null;
        }

        function looksLikeStatus(value) {
          return typeof value.phase === 'string' && typeof value.status === 'string';
        }

        function looksLikeVerdict(value) {
          return typeof value.status === 'string' && ('deliveryId' in value || 'lane' in value);
        }

        var PHASE_COPY = {
          queued: 'Queued. The round is waiting to start.',
          dispatched: 'Starting the agent…',
          building: 'The agent is building.',
          submitted: 'Sources delivered. The gate is picking them up.',
          gating: 'The gate is checking this delivery.',
          ready_for_review: 'Ready for review.',
          publishing: 'Publishing…',
          published: 'Published.',
          needs_changes: 'Needs changes.',
          failed: 'The round failed.',
          canceled: 'The round was canceled.',
          abandoned: 'The round was abandoned.'
        };

        var GATE_COPY = {
          pending: 'Gate status is pending.',
          green: 'Publish gate green — the round is complete.',
          red: 'Publish gate red. The report below says what failed.',
          preview_passed: 'Preview gate passed — the build runs. Publish still needs a green publish gate.',
          preview_failed: 'Preview gate failed. The report below says what broke.',
          kit_outdated: 'The Creator Kit rotated mid-round. Re-run get_kit, then resubmit with fromLatestDelivery.'
        };

        var STALL_COPY = {
          no_agent_yet: 'Waiting for an agent to connect.',
          not_dispatched: 'Not picked up yet.',
          quiet: 'No signal from the agent for a while.',
          ended: 'The agent has stopped.',
          gate_not_started: 'The gate did not start.',
          awaiting_input: 'Waiting on the creator.'
        };

        /** Terminal for a *round*: nothing further will arrive, so stop polling. */
        function isFinished(status) {
          var gate = status.gate;
          if (gate && gate.status === 'green') return true;
          return (
            status.phase === 'published' ||
            status.phase === 'canceled' ||
            status.phase === 'abandoned' ||
            status.phase === 'failed'
          );
        }

        function renderGateOnly(verdict) {
          var status = typeof verdict.status === 'string' ? verdict.status : 'pending';
          pill.textContent = status.replace(/_/g, ' ');
          pill.className = 'pill pill-' + status;
          summary.textContent =
            (typeof verdict.summary === 'string' && verdict.summary) || GATE_COPY[status] || 'Gate status: ' + status;

          metaList.textContent = '';
          addRow('Lane', verdict.lane);
          addRow('Delivery', verdict.deliveryId);
          addRow('Ran at', formatTime(verdict.ranAt));
          if (status === 'pending') {
            addRow('Next step', verdict.deliveryId ? 'Watch Studio' : 'Continue building');
          }

          if (typeof verdict.report === 'string' && verdict.report.trim()) {
            report.textContent = verdict.report;
            report.hidden = false;
          } else {
            report.hidden = true;
          }

          foot.textContent =
            status === 'pending'
              ? verdict.deliveryId
                ? 'This card is a static snapshot. The agent has stopped; Studio will show the eventual result.'
                : 'Nothing has been delivered yet. Continue building and submit before checking again.'
              : '';
          reportSize();
        }

        function render(status) {
          var gate = status.gate && typeof status.gate === 'object' ? status.gate : null;
          var gateStatus = gate && typeof gate.status === 'string' ? gate.status : null;
          var headline = gateStatus && gateStatus !== 'pending' ? gateStatus : status.phase;

          pill.textContent = String(headline).replace(/_/g, ' ');
          pill.className = 'pill pill-' + headline;

          if (status.title) {
            titleEl.textContent = status.slug ? status.title + ' · ' + status.slug : status.title;
            titleEl.hidden = false;
          } else {
            titleEl.hidden = true;
          }

          var line = null;
          if (gateStatus && gateStatus !== 'pending') {
            line = (typeof gate.summary === 'string' && gate.summary) || GATE_COPY[gateStatus];
          }
          if (!line) line = PHASE_COPY[status.phase];
          if (!line && gateStatus) line = GATE_COPY[gateStatus];
          summary.textContent = line || 'Round status: ' + status.phase;

          if (status.note && typeof status.note.text === 'string' && status.note.text) {
            noteEl.textContent = status.note.text;
            var when = document.createElement('span');
            when.className = 'when';
            when.textContent = formatTime(status.note.createdAt);
            noteEl.appendChild(when);
            noteEl.hidden = false;
          } else {
            noteEl.hidden = true;
          }

          if (status.shot && status.shot.png) {
            shotImg.src = 'data:image/png;base64,' + status.shot.png;
            shotCap.textContent = (status.shot.label ? status.shot.label + ' · ' : '') + formatTime(status.shot.createdAt);
            shotEl.hidden = false;
          }
          if (status.shot && status.shot.id) lastShotId = status.shot.id;

          metaList.textContent = '';
          if (gate) {
            addRow('Lane', gate.lane);
            addRow('Delivery', gate.deliveryId);
            addRow('Ran at', formatTime(gate.ranAt));
          }
          if (typeof status.deliveriesRemaining === 'number') {
            addRow('Deliveries left', status.deliveriesRemaining);
          }
          if (status.stall && STALL_COPY[status.stall]) addRow('Note', STALL_COPY[status.stall]);

          if (gate && typeof gate.report === 'string' && gate.report.trim()) {
            report.textContent = gate.report;
            report.hidden = false;
          } else {
            report.hidden = true;
          }

          if (isFinished(status)) {
            foot.textContent = '';
          } else if (gateStatus === 'pending' && gate && !gate.deliveryId) {
            foot.textContent = 'Nothing has been delivered yet. Continue building and submit before checking again.';
          } else {
            foot.innerHTML = '';
            var dot = document.createElement('span');
            dot.className = 'live';
            foot.appendChild(dot);
            foot.appendChild(document.createTextNode('Updating on its own — no need to ask the agent.'));
          }
          reportSize();
        }

        function schedule(seconds) {
          if (stopped || timer) return;
          var delay = Math.max(10, Number(seconds) || 30) * 1000;
          timer = setTimeout(function () {
            timer = null;
            poll();
          }, delay);
        }

        function poll() {
          if (stopped || !sessionKey) return;
          var args = { sessionKey: sessionKey };
          if (lastShotId) args.sinceShotId = lastShotId;
          var id = nextId++;
          pendingCalls[id] = function (result, error) {
            if (error) {
              // A host that refuses app-only calls, or a retired key: fall back to the
              // payload we were opened with rather than showing a broken card.
              stopped = true;
              log('warning', 'round status unavailable: ' + String(error));
              if (!live && seed) renderGateOnly(seed);
              return;
            }
            var status = unwrap(result, looksLikeStatus);
            if (!status) {
              stopped = true;
              log('warning', 'round status arrived in an unrecognised shape');
              if (!live && seed) renderGateOnly(seed);
              return;
            }
            live = true;
            render(status);
            if (isFinished(status)) stopped = true;
            else schedule(status.retryAfterSeconds);
          };
          post({
            jsonrpc: '2.0',
            id: id,
            method: 'tools/call',
            params: { name: 'get_round_status', arguments: args }
          });
        }

        function noteSessionKey(value) {
          if (typeof value === 'string' && value && !sessionKey) {
            sessionKey = value;
            poll();
          }
        }

        function onHostMessage(event) {
          if (host && host !== window && event.source !== host) return;
          var message = event.data;
          if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return;

          if (initializeId !== null && message.id === initializeId && !initialized) {
            initialized = true;
            if (message.result) applyHostContext(message.result.hostContext);
            notify('ui/notifications/initialized', {});
            log('debug', 'round view initialized');
            reportSize();
            return;
          }

          if (message.id !== undefined && pendingCalls[message.id]) {
            var handler = pendingCalls[message.id];
            delete pendingCalls[message.id];
            handler(message.result, message.error);
            return;
          }

          // The arguments of the tool that opened this view carry the round's key.
          if (message.method === 'ui/notifications/tool-input') {
            var input = message.params && (message.params.arguments || message.params.input || message.params);
            if (input && typeof input === 'object') noteSessionKey(input.sessionKey);
            return;
          }

          if (message.method === 'ui/notifications/tool-result') {
            var verdict = unwrap(message.params, looksLikeVerdict);
            if (verdict && !live) {
              seed = verdict;
              renderGateOnly(verdict);
            }
            // start returns the key in its result; the others carry it in their input.
            var payload = unwrap(message.params, function (value) {
              return typeof value.sessionKey === 'string';
            });
            if (payload) noteSessionKey(payload.sessionKey);
            return;
          }

          if (message.method === 'ping') {
            post({ jsonrpc: '2.0', id: message.id, result: {} });
            return;
          }

          if (message.method === 'ui/resource-teardown') {
            stopped = true;
            if (timer) clearTimeout(timer);
            window.removeEventListener('message', onHostMessage);
            window.removeEventListener('resize', reportSize);
          }
        }

        window.addEventListener('message', onHostMessage);

        initializeId = request('ui/initialize', {
          protocolVersion: '2026-01-26',
          capabilities: {},
          clientInfo: { name: 'gamedevpl-round-status', version: '0.2.0' }
        });

        window.addEventListener('resize', reportSize);
      })();
    </script>
  </body>
</html>
`;

const UI_RESOURCES: readonly UiResource[] = Object.freeze([
  {
    uri: ROUND_STATUS_RESOURCE_URI,
    name: 'Round status card',
    description: "Renders a gamedev.pl build round's gate verdict inside the conversation.",
    mimeType: MCP_UI_MIME_TYPE,
    text: ROUND_STATUS_HTML,
  },
]);

/** Descriptors for `resources/list` — no bodies. */
export function uiResourceDescriptors(): Array<Omit<UiResource, 'text'>> {
  return UI_RESOURCES.map(({ text: _text, ...descriptor }) => descriptor);
}

/** One `resources/read` content entry, or null when the URI is not ours. */
export function readUiResource(uri: string): { uri: string; mimeType: string; text: string } | null {
  const found = UI_RESOURCES.find((resource) => resource.uri === uri);
  if (!found) return null;
  return { uri: found.uri, mimeType: found.mimeType, text: found.text };
}
