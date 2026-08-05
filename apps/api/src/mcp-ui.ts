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
 * The view declares an empty CSP rather than leaning on the host default. Same effect —
 * it fetches nothing — but stated rather than assumed, and ChatGPT refuses to accept a
 * template for submission without it. `frameDomains` stays empty until Phase 2 needs a
 * nested frame, and opting into it is documented to trigger stricter review, so it is
 * not something to declare speculatively.
 */

/** Extension id hosts advertise in `initialize` and we echo back when we support it. */
export const MCP_UI_EXTENSION = 'io.modelcontextprotocol/ui';

/** The only view content type SEP-1865 defines for its initial release. */
export const MCP_UI_MIME_TYPE = 'text/html;profile=mcp-app';

/** The round card: opened by a tool call, then live from `get_round_status`. */
export const ROUND_STATUS_RESOURCE_URI = 'ui://gamedevpl/round-status';

/**
 * Tools that open the round view — kept deliberately few, because the host renders one
 * card per tool call that carries `_meta.ui`.
 *
 * `submit_sources` used to be here and was removed: an ordinary turn calls `start` and
 * then delivers, which rendered two cards showing identical state one above the other.
 * Nothing was lost by dropping it. The card is live, so the one opened at `start`
 * already follows the delivery and the gate on its own — that is the whole point of it.
 *
 * `get_gate_verdict` stays for the creator-led check on a later turn, when no `start`
 * precedes it. Doubling up there needs an agent that both opens a round and polls in
 * one turn, which the workflow tells it not to do (prefer `end`, let the card watch).
 *
 * `open_round` is deliberately absent for a different reason: it mints no session key
 * and takes none — its own description sends the agent to `start()` for one — so a card
 * opened there would have no credential and would sit on "Reading round status…".
 */
export const MCP_UI_TOOL_RESOURCES: Readonly<Record<string, string>> = Object.freeze({
  start: ROUND_STATUS_RESOURCE_URI,
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
export const MCP_UI_APP_ONLY_TOOLS: ReadonlySet<string> = new Set(['get_round_status', 'get_round_media']);

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

/*
 * `ui.domain` is deliberately NOT declared, after declaring it broke Claude.
 *
 * It is not our origin. Claude validates it against a value derived from the connector
 * URL the *user* typed:
 *
 *   sha256(<connector URL>).hex.slice(0, 32) + '.claudemcpcontent.com'
 *
 * — so `https://www.gamedev.pl/api/mcp`, the same with a trailing slash, and the apex
 * spelling each produce a different expected domain. A static resource cannot know which
 * one a given creator configured, and a wrong value fails validation exactly as ours did
 * ("ui.domain validation failed for connector …" in the Claude console).
 *
 * Omitting it is what worked before. The only thing it gates is ChatGPT plugin
 * submission, which is owner-gated and not imminent; when that day comes this needs to be
 * derived per request from the URL the client actually called, not hardcoded.
 */

interface UiCsp {
  readonly connectDomains: readonly string[];
  readonly resourceDomains: readonly string[];
  readonly frameDomains: readonly string[];
}

interface UiResourceMeta {
  ui: { csp: UiCsp };
  /** ChatGPT reads its own compatibility key rather than `ui.csp`. */
  'openai/widgetCSP': {
    connect_domains: readonly string[];
    resource_domains: readonly string[];
    frame_domains: readonly string[];
  };
}

/** What `resources/list` returns per view: everything but the body. */
export type UiResourceDescriptor = Omit<UiResource, 'text'> & { _meta: UiResourceMeta };

/** What `resources/read` returns: the body, plus the same declared metadata. */
export type UiResourceContents = Pick<UiResource, 'uri' | 'mimeType' | 'text'> & { _meta: UiResourceMeta };

/**
 * Declared per resource. Empty by design: the card inlines everything, screenshots
 * arrive as data URIs, and it calls tools through the host rather than the network.
 */
const VIEW_CSP: UiCsp = Object.freeze({
  // Frozen individually: Object.freeze is shallow, and this one object is handed out
  // on every resources/list and resources/read.
  connectDomains: Object.freeze([]) as readonly string[],
  resourceDomains: Object.freeze([]) as readonly string[],
  frameDomains: Object.freeze([]) as readonly string[],
});

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
      /* The gate's own frames: a strip, so several fit without pushing the verdict off. */
      .gallery {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 6px;
        margin: 12px 0 0;
      }
      .gallery img {
        width: 100%;
        max-height: 150px;
        object-fit: contain;
        background: #0c0e0f;
        border: 1px solid var(--gd-border);
        border-radius: 6px;
        display: block;
      }
      .galleryCap { margin: 6px 0 0; font-size: 11.5px; color: var(--gd-muted); }
      .actions { margin: 12px 0 0; }
      .action {
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--gd-accent);
        background: transparent;
        border: 1px solid var(--gd-accent);
        border-radius: 999px;
        padding: 7px 14px;
        cursor: pointer;
      }
      .action:hover:not(:disabled) { background: rgba(0, 228, 172, 0.12); }
      /* Custom colours can leave the platform focus ring invisible on this card. */
      .action:focus-visible { outline: 2px solid var(--gd-accent); outline-offset: 2px; }
      .action:disabled { color: var(--gd-muted); border-color: var(--gd-border); cursor: default; }
      .hint {
        margin: 8px 0 0;
        padding: 8px;
        border: 1px solid var(--gd-border);
        border-radius: 8px;
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 11.5px;
        line-height: 1.45;
        white-space: pre-wrap;
        color: var(--gd-muted);
      }
      /* One click selects the whole instruction. The creator is copying this by hand
         on every host that will not post for them, so make that the easy path. */
      .hintText { display: block; margin-top: 6px; color: var(--gd-fg); user-select: all; }
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
      <div id="gallery" class="gallery" hidden></div>
      <p id="galleryCap" class="galleryCap" hidden></p>
      <dl id="meta" class="meta"></dl>
      <pre id="report" class="report" hidden></pre>
      <div id="actionRow" class="actions" hidden>
        <button id="actionBtn" type="button" class="action"></button>
        <p id="actionHint" class="hint" hidden></p>
      </div>
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
        var inFlight = false;
        var attempts = 0;
        var speculative = false;
        var giveUpTimer = null;
        var contextKey = null;
        var lastFailure = null;
        var mediaKey = null;
        var mediaTriesFor = null;
        var mediaTries = 0;
        var hostCaps = null;
        var REPORT_CONTEXT_LIMIT = 4000;
        var stopped = false;
        var timer = null;

        var pill = document.getElementById('pill');
        var titleEl = document.getElementById('title');
        var summary = document.getElementById('summary');
        var noteEl = document.getElementById('note');
        var shotEl = document.getElementById('shot');
        var shotImg = document.getElementById('shotImg');
        var shotCap = document.getElementById('shotCap');
        var actionRow = document.getElementById('actionRow');
        var actionBtn = document.getElementById('actionBtn');
        var actionHint = document.getElementById('actionHint');
        var gallery = document.getElementById('gallery');
        var galleryCap = document.getElementById('galleryCap');
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

        function shotCaption(shot) {
          return (shot.label ? shot.label + ' · ' : '') + formatTime(shot.createdAt);
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
          kit_outdated: 'The Creator Kit changed mid-round, so this delivery has to be rebuilt against the new one.'
        };

        var STALL_COPY = {
          no_agent_yet: 'Waiting for an agent to connect.',
          not_dispatched: 'Not picked up yet.',
          quiet: 'No signal from the agent for a while.',
          ended: 'The agent has stopped.',
          gate_not_started: 'The gate did not start.',
          awaiting_input: 'Waiting on the creator.'
        };

        var ACTIONS = {
          kit_outdated: {
            label: 'Rebuild against the new kit',
            text:
              'The gate refused the last delivery with kit_outdated. Re-run get_kit for a fresh engineRef, then ' +
              'submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) using the same mode as that ' +
              'delivery. Do not re-stage or re-upload the whole tree.'
          },
          red: {
            label: 'Ask the agent to fix it',
            text: 'The publish gate came back red. Read the gate report, fix what failed, and resubmit on the same key.'
          },
          preview_failed: {
            label: 'Ask the agent to fix it',
            text: 'The preview gate failed. Read the gate report, fix what broke, and re-preview on the same key.'
          },
          preview_passed: {
            label: 'Ask the agent to publish',
            text:
              'The preview gate passed. Record TRACE and PLAYTEST, then submit_sources with mode=publish to seal ' +
              'this round.'
          }
        };

        function renderAction(status, gateStatus) {
          // Only once the agent has stopped: while it is still working it will act on a
          // red gate itself, and a second instruction would just talk over it.
          var action = gateStatus && status.agentEnded ? ACTIONS[gateStatus] : null;
          if (!action) {
            actionRow.hidden = true;
            return;
          }
          actionBtn.textContent = action.label;
          actionBtn.disabled = false;
          actionHint.hidden = true;
          actionRow.hidden = false;
          actionBtn.onclick = function () {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Sending…';
            var id = nextId++;
            pendingCalls[id] = function (result, error) {
              if (error) {
                offerToCopy(action);
              } else {
                actionBtn.textContent = 'Sent to the agent';
              }
              reportSize();
            };
            post({
              jsonrpc: '2.0',
              id: id,
              method: 'ui/message',
              params: { role: 'user', content: { type: 'text', text: action.text } }
            });
          };
        }

        /**
         * What the button becomes when the host will not post for us.
         *
         * Claude refuses ui/message (owner test, 2026-08-05), and the spec version we
         * target has no host capability to ask in advance — so this path is the normal
         * one, not the exception. Restoring the original label and quietly printing the
         * text below it read as "the button did nothing": the creator has no idea the
         * words are now theirs to carry. So the button changes job instead, and says so.
         */
        function offerToCopy(action) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Copy for your agent';
          actionBtn.onclick = function () {
            // Selecting the text always works and needs no permission, so do that first
            // and unconditionally: whatever the clipboard does, the click visibly did
            // something. A Copy button that silently fails is the dead button again.
            var range = document.createRange();
            range.selectNodeContents(document.getElementById('hintText'));
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            actionBtn.textContent = 'Selected — press Ctrl/Cmd+C';

            // Clipboard access needs a sandbox permission the host may not have granted,
            // so this is the shortcut, never the mechanism.
            try {
              var written = navigator.clipboard && navigator.clipboard.writeText(action.text);
              if (written && written.then) {
                written.then(function () {
                  actionBtn.textContent = 'Copied — paste it to your agent';
                }, function () {});
              }
            } catch (e) {}
          };

          actionHint.textContent = '';
          var lead = document.createElement('span');
          lead.textContent = 'This chat app will not send it for you. Give your agent these words:';
          var body = document.createElement('span');
          body.className = 'hintText';
          body.id = 'hintText';
          body.textContent = action.text;
          actionHint.appendChild(lead);
          actionHint.appendChild(body);
          actionHint.hidden = false;
        }

        /** Terminal for a *round*: nothing further will arrive, so stop polling. */
        function isFinished(status) {
          var gate = status.gate;
          if (gate && gate.status === 'green') return true;
          // Agent gone and a verdict already in: nothing further will arrive until
          // somebody acts, and that act opens a fresh card.
          if (status.agentEnded && gate && gate.status && gate.status !== 'pending') return true;
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

          actionRow.hidden = true;
          gallery.hidden = true;
          galleryCap.hidden = true;
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

          // Order matters, and the job's own phase comes last: it lags reality. An agent
          // that has delivered and called end still reads as 'building' for a while, so
          // leading with the phase told a creator the agent was working while the note
          // right below it said the agent had stopped.
          var line = null;
          if (gateStatus && gateStatus !== 'pending') {
            var gateSummary = typeof gate.summary === 'string' ? gate.summary : '';
            line = (gateSummary.length && gateSummary.length <= 180 ? gateSummary : '') || GATE_COPY[gateStatus] || gateSummary;
          } else if (gate && gate.deliveryId) {
            line = 'Delivered — the gate is checking it.';
          } else if (status.agentEnded) {
            line = 'The agent has stopped without delivering.';
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

          // Three cases, and the middle one is why this is not a one-liner: bytes arrive
          // only when the frame changed, so an unchanged shot must keep the image it
          // already has, and a round with no shot at all must clear a stale one.
          if (status.shot && status.shot.png) {
            shotImg.src = 'data:image/png;base64,' + status.shot.png;
            shotCap.textContent = shotCaption(status.shot);
            shotEl.hidden = false;
          } else if (status.shot && shotImg.getAttribute('src')) {
            shotCap.textContent = shotCaption(status.shot);
            shotEl.hidden = false;
          } else {
            shotEl.hidden = true;
            shotImg.removeAttribute('src');
          }
          lastShotId = status.shot && status.shot.id ? status.shot.id : null;

          metaList.textContent = '';
          if (gate) {
            addRow('Lane', gate.lane);
            addRow('Delivery', gate.deliveryId);
            addRow('Ran at', formatTime(gate.ranAt));
          }
          if (typeof status.deliveriesRemaining === 'number') {
            addRow('Deliveries left', status.deliveriesRemaining);
          }
          if (status.stall && STALL_COPY[status.stall] && STALL_COPY[status.stall] !== summary.textContent) {
            addRow('Note', STALL_COPY[status.stall]);
          }

          var detail = gate && typeof gate.report === 'string' ? gate.report.trim() : '';
          if (!detail && gate && typeof gate.summary === 'string' && gate.summary.length > 180) {
            // A long agent-facing summary is the detail, even when the gate sent no
            // separate report.
            detail = gate.summary.trim();
          }
          if (detail && detail !== summary.textContent) {
            report.textContent = detail;
            report.hidden = false;
          } else {
            report.hidden = true;
          }

          renderAction(status, gateStatus);

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

        function giveUp() {
          giveUpTimer = null;
          if (live) return;
          if (seed) {
            renderGateOnly(seed);
          } else {
            summary.textContent = 'Could not read round status here.';
          }
          // Say which of the two ways it failed. Without this a screenshot of a broken
          // card is indistinguishable between "the host never gave this view a round
          // key" and "the host refused the call", and those need opposite fixes.
          var diagnostic =
            lastFailure ||
            (sessionKey
              ? 'The status call was refused.'
              : 'This view was never given a round key, so it could not ask.');
          // Appended, never substituted. renderGateOnly may have just put the gate's own
          // report here, and that is what the creator came to read — a diagnostic about
          // our polling is the footnote, not the headline.
          // The escapes are doubled on purpose: this file is a template literal, so a
          // bare \\n here would emit a real line break inside a JS string and break the
          // view. tsc and lint both pass it; only the browser notices.
          report.textContent =
            report.hidden || !report.textContent ? diagnostic : report.textContent + '\\n\\n' + diagnostic;
          report.hidden = false;
          reportSize();
        }

        /**
         * The last piece of watching-without-polling: when a verdict lands the agent is
         * usually gone, so nothing in the conversation knows it. The host holds this
         * until the next user message, so if the creator then says "fix it" the agent
         * already has the verdict instead of spending a call to discover it. Sent once
         * per distinct verdict — polling must not re-announce the same thing.
         */
        function pushModelContext(status) {
          var gate = status.gate;
          if (!gate || typeof gate.status !== 'string' || gate.status === 'pending') return;
          var key = gate.status + ':' + (gate.deliveryId || '');
          if (key === contextKey) return;
          contextKey = key;
          // The report, not the summary, is what says what broke — and the app-only
          // status result never reaches the transcript, so without it here a follow-up
          // 'fix it' still costs a tool call to discover the failure. Bounded, because
          // this lands in the model's context whether or not it is ever used.
          var report = typeof gate.report === 'string' ? gate.report.trim() : '';
          if (report.length > REPORT_CONTEXT_LIMIT) {
            report = report.slice(0, REPORT_CONTEXT_LIMIT) + '\\n… (truncated; call get_gate_verdict for the rest)';
          }
          request('ui/update-model-context', {
            structuredContent: {
              slug: status.slug || null,
              phase: status.phase,
              gate: {
                status: gate.status,
                lane: gate.lane || null,
                deliveryId: gate.deliveryId || null,
                summary: typeof gate.summary === 'string' ? gate.summary : null,
                report: report || null
              }
            }
          });
        }

        /**
         * The gate's frames, fetched once per delivery when a verdict exists.
         *
         * This is the picture the agent cannot take: it has no browser to run the game
         * in, so its only honest options are a real gate capture or nothing. The gate
         * captures on both lanes; the card is already here when the verdict lands.
         */
        function loadMedia(status) {
          var gate = status.gate;
          if (!gate || !gate.deliveryId || gate.status === 'pending') return;
          if (mediaKey === gate.deliveryId) return;
          if (mediaTriesFor !== gate.deliveryId) {
            mediaTriesFor = gate.deliveryId;
            mediaTries = 0;
          }
          mediaKey = gate.deliveryId;
          var id = nextId++;
          pendingCalls[id] = function (result, error) {
            if (error) {
              log('warning', 'gate media unavailable: ' + String(error));
              // Frames are written by the gate a moment after the verdict, so the first
              // read can lose a race it will win next poll. Retry once, then stop —
              // a card that re-asks every 30s forever is worse than a card without a
              // picture.
              mediaTries++;
              if (mediaTries < 2) mediaKey = null;
              return;
            }
            var media = unwrap(result, function (value) {
              return Array.isArray(value.frames);
            });
            if (!media) return;
            renderMedia(media);
          };
          var args = { deliveryId: gate.deliveryId };
          if (sessionKey) args.sessionKey = sessionKey;
          post({ jsonrpc: '2.0', id: id, method: 'tools/call', params: { name: 'get_round_media', arguments: args } });
        }

        function renderMedia(media) {
          gallery.textContent = '';
          var frames = media.frames || [];
          for (var i = 0; i < frames.length; i++) {
            if (!frames[i] || typeof frames[i].png !== 'string') continue;
            var img = document.createElement('img');
            img.src = 'data:image/png;base64,' + frames[i].png;
            img.alt = frames[i].name || 'Frame captured by the gate';
            gallery.appendChild(img);
          }
          gallery.hidden = gallery.childNodes.length === 0;

          galleryCap.textContent = '';
          galleryCap.hidden = true;
          if (!gallery.hidden) {
            var omitted = Number(media.framesOmitted) || 0;
            galleryCap.textContent =
              'Captured by the gate' +
              (media.lane ? ' on the ' + media.lane + ' run' : '') +
              '.' +
              (omitted > 0 ? ' ' + omitted + ' more frame' + (omitted === 1 ? '' : 's') + ' too large to show.' : '');
            galleryCap.hidden = false;
          } else if (typeof media.reason === 'string' && media.reason) {
            // No strip is a fact about the run, not a rendering failure. Say which.
            galleryCap.textContent = 'No frames: ' + media.reason + '.';
            galleryCap.hidden = false;
          }
          // A video is megabytes; it cannot ride a postMessage and the CSP declares no
          // domains, so hand it to the host to open rather than trying to play it here.
          if (media.video && typeof media.video.url === 'string' && media.video.url) {
            var link = document.createElement('button');
            link.type = 'button';
            link.className = 'action';
            link.style.marginTop = '8px';
            link.textContent = 'Watch the gate recording';
            link.onclick = (function (url) {
              return function () {
                request('ui/open-link', { url: url });
              };
            })(media.video.url);
            galleryCap.hidden = false;
            galleryCap.appendChild(document.createElement('br'));
            galleryCap.appendChild(link);
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
          if (stopped || inFlight) return;
          inFlight = true;
          attempts += 1;
          // Without a key this is a guess: hosts differ on whether they carry the
          // connection's own credential into an app-only call, and Claude does not.
          speculative = !sessionKey;
          // Observed in Claude: a view does not inherit the connection's credential, so
          // a keyless call is refused. We still make it — a host that does carry the
          // credential answers immediately, and the refusal costs nothing visible.
          var args = {};
          if (sessionKey) args.sessionKey = sessionKey;
          if (lastShotId) args.sinceShotId = lastShotId;
          var id = nextId++;
          pendingCalls[id] = function (result, error) {
            inFlight = false;
            var status = error ? null : unwrap(result, looksLikeStatus);
            if (!status) {
              // Never JSON.stringify a value the host handed us: structured clone
              // carries cycles, and a throw here is inside the message handler, which
              // would take the card's whole update path down with it. A plain coercion
              // says less and cannot fail.
              var reason = error
                ? 'call refused: ' + String(error.message || error.code || error).slice(0, 200)
                : 'the reply was not round status';
              lastFailure = (sessionKey ? 'with a round key, ' : 'without a round key, ') + reason;
              log('warning', 'round status unavailable: ' + lastFailure);
              if (speculative) {
                // The key can land while this very request is in flight, in which case
                // noteSessionKey's own poll() was dropped as already in flight. Retry
                // here, or the card waits out the whole give-up timer while holding a
                // usable credential.
                if (sessionKey) {
                  poll();
                  return;
                }
                // Stay quiet and wait for the opening tool to hand us its key. Only if
                // one never arrives is this a real failure worth showing.
                if (!giveUpTimer) giveUpTimer = setTimeout(giveUp, 20000);
                return;
              }
              if (!live) giveUp();
              if (attempts >= 2) stopped = true;
              return;
            }
            live = true;
            pushModelContext(status);
            loadMedia(status);
            if (giveUpTimer) {
              clearTimeout(giveUpTimer);
              giveUpTimer = null;
            }
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
          if (typeof value !== 'string' || !value || sessionKey === value) return;
          sessionKey = value;
          // Worth another attempt: the keyless poll was refused for want of exactly this.
          if (!live) {
            if (giveUpTimer) {
              clearTimeout(giveUpTimer);
              giveUpTimer = null;
            }
            stopped = false;
            attempts = 0;
            poll();
          }
        }

        function onHostMessage(event) {
          if (host && host !== window && event.source !== host) return;
          var message = event.data;
          if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return;

          if (initializeId !== null && message.id === initializeId && !initialized) {
            initialized = true;
            if (message.result) {
              applyHostContext(message.result.hostContext);
              // Kept for the action button. The stable spec's HostCapabilities has no
              // field for ui/message support at all — the draft adds one — so absence
              // proves nothing today and we still have to try and see.
              hostCaps = message.result.capabilities || null;
            }
            notify('ui/notifications/initialized', {});
            log('debug', 'round view initialized');
            reportSize();
            poll();
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
            if (giveUpTimer) clearTimeout(giveUpTimer);
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

/**
 * What a host reads about a view: its CSP, twice — once in the standard shape and once
 * in ChatGPT's. Deliberately no origin; see the note on `ui.domain` above.
 */
function uiResourceMeta(): UiResourceMeta {
  return {
    ui: { csp: VIEW_CSP },
    // Same declaration in the shape ChatGPT reads. It showed a "CSP off" badge against
    // the modern key alone, and both are documented, so we say it twice rather than
    // guess which one a host honours.
    'openai/widgetCSP': {
      connect_domains: VIEW_CSP.connectDomains,
      resource_domains: VIEW_CSP.resourceDomains,
      frame_domains: VIEW_CSP.frameDomains,
    },
  };
}

/** Descriptors for `resources/list` — no bodies. */
export function uiResourceDescriptors(): UiResourceDescriptor[] {
  return UI_RESOURCES.map(({ text: _text, ...descriptor }) => ({ ...descriptor, _meta: uiResourceMeta() }));
}

/** One `resources/read` content entry, or null when the URI is not ours. */
export function readUiResource(uri: string): UiResourceContents | null {
  const found = UI_RESOURCES.find((resource) => resource.uri === uri);
  if (!found) return null;
  return { uri: found.uri, mimeType: found.mimeType, text: found.text, _meta: uiResourceMeta() };
}
