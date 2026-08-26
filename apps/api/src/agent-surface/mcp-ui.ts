import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';

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
 * The tool that opens the round view. Exactly one, and it exists for nothing else.
 *
 * This used to be `start` and `get_gate_verdict` — tools an agent calls for their own
 * reasons. That made a card a *side effect* of workflow mechanics, so behaviour we
 * neither control nor should have to decided how many cards a conversation got: an
 * agent that re-ran `start` before each operation to "reacquire the key" left one card
 * per call (ChatGPT, 2026-08-05). It was not doing anything wrong enough to forbid, and
 * no host-side reasoning fixes a cause that lives in the agent's own discretion.
 *
 * So showing the creator something is now a deliberate act with a deliberate tool.
 * Calling `show_round` twice asks for two cards, which is at least honest.
 *
 * Keep this map at one entry unless a second surface genuinely needs its own view. The
 * host renders one card per call that carries `_meta.ui`, and every tool added here
 * hands that decision back to whatever the agent happens to do.
 */
export const MCP_UI_TOOL_RESOURCES: Readonly<Record<string, string>> = Object.freeze({
  show_round: ROUND_STATUS_RESOURCE_URI,
  // Same card, second intent. "Show me the screenshots" is not "watch this round" — it
  // names a delivery that may belong to an earlier round — but it wants the same
  // furniture around the pictures, so it opens the same view rather than a second one.
  //
  // This is the exception the note above allows for, and it is worth stating why it
  // qualifies: `get_gate_media` puts frames in front of the *model*, which can look at
  // them and cannot show them. A view is the only surface that reaches the creator.
  show_media: ROUND_STATUS_RESOURCE_URI,
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
  /**
   * ChatGPT's dedicated origin for the hosted component. Required to submit an app with
   * UI, and deliberately *not* the standard `ui.domain` — see the note on WIDGET_DOMAIN.
   */
  'openai/widgetDomain': string;
  /** ChatGPT reads its own compatibility key rather than `ui.csp`. */
  'openai/widgetCSP': {
    connect_domains: readonly string[];
    resource_domains: readonly string[];
    frame_domains: readonly string[];
    /** External-link targets, which `ui.csp` has no field for. */
    redirect_domains: readonly string[];
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
/**
 * Where the card is allowed to send the reader.
 *
 * Only our own site: every link the card offers is a gamedev.pl page — the gate
 * recording, and the game theater the Play button opens. A wider list would let a
 * future card hand the host somewhere we did not intend.
 *
 * Derived from `canonicalAppBaseUrl()` rather than written out, because the server
 * builds the Play URL from the same function. Hardcoding this list once meant the two
 * could disagree, and they did: the link was built from `WEB_ORIGIN`, whose first entry
 * in production is the Cloud Run service URL, so every production link pointed at an
 * origin this list did not allow (Codex, #617). A view whose allowlist and whose links
 * come from one source cannot have that bug.
 */
function linkDomains(): readonly string[] {
  return Object.freeze([canonicalAppBaseUrl()]);
}

/**
 * The origin ChatGPT associates with this hosted component.
 *
 * Declared on the `openai/*` key **only**, never on the standard `ui.domain`. Claude
 * validates `ui.domain` against a value it derives itself —
 * `sha256(<connector URL>).hex.slice(0, 32) + '.claudemcpcontent.com'` — so declaring our
 * own origin there broke the card in production once already (public repo #593, reverted
 * in #595). An `openai/*` key is invisible to Claude, which makes it the safe place to
 * satisfy OpenAI without re-litigating that.
 *
 * Owner's decision (2026-08-05) to use the main origin rather than a dedicated subdomain,
 * with the trade understood: if ChatGPT serves the component *on* this origin, the card
 * becomes same-origin with the real site and could reach anything scoped to it. Tolerable
 * only because the card is our own trusted first-party UI and nests nothing — the §13
 * decision to cut in-chat play is what keeps that true. If a view ever embeds untrusted
 * content, this must move to an isolated origin first.
 */
const WIDGET_DOMAIN = 'https://www.gamedev.pl';

const VIEW_CSP: UiCsp = Object.freeze({
  // Frozen individually: Object.freeze is shallow, and this one object is handed out
  // on every resources/list and resources/read.
  connectDomains: Object.freeze([]) as readonly string[],
  resourceDomains: Object.freeze([]) as readonly string[],
  frameDomains: Object.freeze([]) as readonly string[],
});

// The card is an asset, not code, so it lives as real HTML next to this file.

// Read at module load: a missing asset must fail the boot, not one MCP call.

// Self-contained by necessity — the host CSP is default-src none.
const ROUND_STATUS_HTML = readFileSync(new URL('./mcp-ui-round-status.html', import.meta.url), 'utf8');

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
    'openai/widgetDomain': WIDGET_DOMAIN,
    // Same declaration in the shape ChatGPT reads. It showed a "CSP off" badge against
    // the modern key alone, and both are documented, so we say it twice rather than
    // guess which one a host honours.
    'openai/widgetCSP': {
      connect_domains: VIEW_CSP.connectDomains,
      resource_domains: VIEW_CSP.resourceDomains,
      frame_domains: VIEW_CSP.frameDomains,
      // Where the card may send the *host* — not where it may fetch from. ChatGPT
      // allowlists external-link targets separately (`redirect_domains`, the allowlist
      // behind `openai.openExternal`), and the standard `ui.csp` has no equivalent
      // field, so this one exists only in the legacy shape.
      //
      // Without it the card's own "Watch the gate recording" button is a link ChatGPT
      // has no permission to follow, and the Play button V3 is built around would be
      // the same. An empty CSP is right for what the card *fetches* — it fetches
      // nothing — but link targets are a different question and were never answered.
      redirect_domains: linkDomains(),
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
