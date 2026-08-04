/**
 * MCP Apps (SEP-1865, extension `io.modelcontextprotocol/ui`) — Phase 0.
 *
 * Phase 0 is a spike, not a feature: capability negotiation, a `ui://` resource
 * registry, and one **static** card that renders whatever tool result the host hands
 * it. There is no polling and no app-only tool yet — those are Phase 1, once the host
 * questions this phase exists to answer come back green.
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

/** Phase 0's single view. */
export const ROUND_STATUS_RESOURCE_URI = 'ui://gamedevpl/round-status';

/**
 * Tools that carry `_meta.ui` when the client is UI-capable. Read tools only in
 * Phase 0 — a card attached to a write tool would render mid-delivery, which is a
 * Phase 1 conversation once the dashboard actually has live state to show.
 */
export const MCP_UI_TOOL_RESOURCES: Readonly<Record<string, string>> = Object.freeze({
  get_gate_verdict: ROUND_STATUS_RESOURCE_URI,
});

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
    <title>gamedev.pl — round status</title>
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
        margin-bottom: 10px;
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
      .pill-waiting, .pill-pending { color: var(--gd-muted); }
      .pill-green, .pill-preview_passed { color: var(--gd-accent); }
      .pill-red, .pill-preview_failed { color: #ff6b6b; }
      .pill-kit_outdated { color: #ffb454; }
      .summary { margin: 0; font-size: 14px; line-height: 1.5; }
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
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="head">
        <span class="brand">gamedev<span class="dot">.pl</span></span>
        <span id="pill" class="pill pill-waiting">waiting</span>
      </div>
      <p id="summary" class="summary">Waiting for the gate verdict…</p>
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

        var pill = document.getElementById('pill');
        var summary = document.getElementById('summary');
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

        var hostLocale = undefined;
        var hostTimeZone = undefined;

        function applyHostContext(context) {
          if (!context || typeof context !== 'object') return;
          if (typeof context.theme === 'string') {
            document.documentElement.setAttribute('data-theme', context.theme);
          }
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
         * Hosts differ in how they wrap a tool result, and pinning that down is half the
         * point of this spike — so dig for the payload rather than assuming one shape.
         */
        function extractVerdict(params) {
          if (!params || typeof params !== 'object') return null;
          var candidates = [
            params.structuredContent,
            params.result && params.result.structuredContent,
            params.toolResult && params.toolResult.structuredContent,
            params.result,
            params
          ];
          for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            if (candidate && typeof candidate === 'object' && typeof candidate.status === 'string') return candidate;
          }
          var content =
            (params.content) ||
            (params.result && params.result.content) ||
            (params.toolResult && params.toolResult.content);
          if (Array.isArray(content)) {
            for (var j = 0; j < content.length; j++) {
              var part = content[j];
              if (!part || part.type !== 'text' || typeof part.text !== 'string') continue;
              try {
                var parsed = JSON.parse(part.text);
                if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') return parsed;
              } catch (error) {
                /* not our JSON body — keep looking */
              }
            }
          }
          return null;
        }

        var COPY = {
          pending: 'The gate is still running. This agent run has stopped; Studio will show the eventual result.',
          green: 'Publish gate green — the round is complete.',
          red: 'Publish gate red. The report below says what failed.',
          preview_passed: 'Preview gate passed — the build runs. Publish still needs a green publish gate.',
          preview_failed: 'Preview gate failed. The report below says what broke.',
          kit_outdated: 'The Creator Kit rotated mid-round. Re-run get_kit, then resubmit with fromLatestDelivery.'
        };

        function render(verdict) {
          var status = typeof verdict.status === 'string' ? verdict.status : 'pending';
          pill.textContent = status.replace(/_/g, ' ');
          pill.className = 'pill pill-' + status;
          summary.textContent =
            (typeof verdict.summary === 'string' && verdict.summary) || COPY[status] || 'Gate status: ' + status;

          metaList.textContent = '';
          addRow('Lane', verdict.lane);
          addRow('Delivery', verdict.deliveryId);
          addRow('Version', verdict.version);
          addRow('Ran at', formatTime(verdict.ranAt));
          if (status === 'pending') {
            addRow('Next step', 'Watch Studio');
          }

          if (typeof verdict.report === 'string' && verdict.report.trim()) {
            report.textContent = verdict.report;
            report.hidden = false;
          } else {
            report.hidden = true;
          }

          foot.textContent =
            status === 'pending'
              ? 'This card is a static snapshot. The agent has stopped; Studio will show the eventual result.'
              : '';
          reportSize();
        }

        function onHostMessage(event) {
          if (host && host !== window && event.source !== host) return;
          var message = event.data;
          if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return;

          if (initializeId !== null && message.id === initializeId && !initialized) {
            initialized = true;
            if (message.result) applyHostContext(message.result.hostContext);
            notify('ui/notifications/initialized', {});
            log('debug', 'round-status view initialized');
            reportSize();
            return;
          }

          if (message.method === 'ui/notifications/tool-result') {
            var verdict = extractVerdict(message.params);
            if (verdict) render(verdict);
            else log('warning', 'tool-result arrived in an unrecognised shape');
            return;
          }

          if (message.method === 'ping') {
            post({ jsonrpc: '2.0', id: message.id, result: {} });
            return;
          }

          if (message.method === 'ui/resource-teardown') {
            window.removeEventListener('message', onHostMessage);
            window.removeEventListener('resize', reportSize);
          }
        }

        window.addEventListener('message', onHostMessage);

        initializeId = request('ui/initialize', {
          protocolVersion: '2026-01-26',
          capabilities: {},
          clientInfo: { name: 'gamedevpl-round-status', version: '0.1.0' }
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
