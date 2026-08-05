import { describe, expect, it } from 'vitest';
import {
  MCP_UI_EXTENSION,
  MCP_UI_MIME_TYPE,
  MCP_UI_APP_ONLY_TOOLS,
  MCP_UI_TOOL_RESOURCES,
  ROUND_STATUS_RESOURCE_URI,
  clientDeclaresUi,
  markSessionIdUiCapable,
  mcpUiEnabled,
  mcpUiServerCapability,
  readUiResource,
  sessionIdIsUiCapable,
  uiResourceDescriptors,
} from './mcp-ui.js';

function withUiExtension(value: unknown) {
  return { capabilities: { extensions: { [MCP_UI_EXTENSION]: value } } };
}

describe('mcpUiEnabled', () => {
  it('stays off unless the flag is explicitly set, so production keeps the pre-views contract', () => {
    expect(mcpUiEnabled({})).toBe(false);
    expect(mcpUiEnabled({ MCP_UI: '' })).toBe(false);
    expect(mcpUiEnabled({ MCP_UI: 'false' })).toBe(false);
    expect(mcpUiEnabled({ MCP_UI: 'no' })).toBe(false);
    expect(mcpUiEnabled({ MCP_UI: 'true' })).toBe(true);
    expect(mcpUiEnabled({ MCP_UI: 'TRUE' })).toBe(true);
    expect(mcpUiEnabled({ MCP_UI: '1' })).toBe(true);
  });
});

describe('clientDeclaresUi', () => {
  it('accepts a client that declares the extension with our mime type', () => {
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: [MCP_UI_MIME_TYPE] }))).toBe(true);
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: ['text/html;profile=mcp-app', 'text/other'] }))).toBe(true);
  });

  it('takes a declaration without mimeTypes at its word', () => {
    expect(clientDeclaresUi(withUiExtension({}))).toBe(true);
  });

  it('accepts any legal spelling of the media type, not just our exact string', () => {
    // Media-type parameters allow surrounding whitespace, quoted values, and differ in
    // case only inside the value — all of these mean the same thing as our constant.
    for (const mimeType of [
      'text/html; profile=mcp-app',
      'text/html ;profile=mcp-app',
      'text/html;profile="mcp-app"',
      'text/html; profile="MCP-App"',
      'TEXT/HTML;PROFILE=mcp-app',
      '  text/html;profile=mcp-app  ',
    ]) {
      expect(clientDeclaresUi(withUiExtension({ mimeTypes: [mimeType] }))).toBe(true);
    }
  });

  it('still refuses html without the mcp-app profile, and the profile on another type', () => {
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: ['text/html'] }))).toBe(false);
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: ['text/plain;profile=mcp-app'] }))).toBe(false);
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: ['text/html;profile=something-else'] }))).toBe(false);
  });

  it('refuses a client that can only render content types we do not serve', () => {
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: ['application/vnd.remote-dom'] }))).toBe(false);
    expect(clientDeclaresUi(withUiExtension({ mimeTypes: 'text/html;profile=mcp-app' }))).toBe(false);
  });

  it('treats every shape that does not declare the extension as not capable', () => {
    expect(clientDeclaresUi(undefined)).toBe(false);
    expect(clientDeclaresUi({})).toBe(false);
    expect(clientDeclaresUi({ capabilities: {} })).toBe(false);
    expect(clientDeclaresUi({ capabilities: { extensions: {} } })).toBe(false);
    expect(clientDeclaresUi({ capabilities: { extensions: { 'io.example/other': {} } } })).toBe(false);
    expect(clientDeclaresUi({ capabilities: { extensions: { [MCP_UI_EXTENSION]: true } } })).toBe(false);
    expect(clientDeclaresUi('nonsense')).toBe(false);
  });
});

describe('view capability in the correlator', () => {
  const secret = 'shared-deploy-secret';

  it('is readable by an instance that never saw the initialize that minted it', () => {
    // The multi-instance property this exists for: Cloud Run does not pin a client to a
    // revision, and in-memory capability did not survive the hop.
    const marked = markSessionIdUiCapable('a'.repeat(36), secret);
    expect(sessionIdIsUiCapable(marked, secret)).toBe(true);
  });

  it('leaves a non-negotiating client with an unchanged, non-capable id', () => {
    expect(sessionIdIsUiCapable('a'.repeat(36), secret)).toBe(false);
    expect(sessionIdIsUiCapable('', secret)).toBe(false);
    expect(sessionIdIsUiCapable(null, secret)).toBe(false);
  });

  it('cannot be forged, guessed, or replayed under another secret', () => {
    const marked = markSessionIdUiCapable('b'.repeat(36), secret);
    expect(sessionIdIsUiCapable(marked, 'a-different-secret')).toBe(false);
    expect(sessionIdIsUiCapable(marked, undefined)).toBe(false);
    // Tampered marker, and a hand-written suffix that merely looks the part.
    expect(sessionIdIsUiCapable(marked.slice(0, -1) + 'X', secret)).toBe(false);
    expect(sessionIdIsUiCapable('c'.repeat(36) + '-uAAAAAAAAAA', secret)).toBe(false);
    // A marker on a different base id does not transfer.
    const suffix = marked.slice(-12);
    expect(sessionIdIsUiCapable('d'.repeat(36) + suffix, secret)).toBe(false);
  });

  it('survives a marker that itself contains the separator', () => {
    // base64url includes "-", so a marker can contain "-u". Searching for the separator
    // would split in the wrong place; slicing from the end cannot.
    let withSeparatorInside: string | null = null;
    for (let i = 0; i < 200_000 && !withSeparatorInside; i += 1) {
      const candidate = markSessionIdUiCapable(`${'e'.repeat(30)}${String(i).padStart(6, '0')}`, secret);
      if (candidate.slice(-10).includes('-u')) withSeparatorInside = candidate;
    }
    // Fail loudly rather than passing with no assertion — a conditional expect would
    // hide the regression this exists to catch.
    expect(withSeparatorInside).not.toBeNull();
    expect(sessionIdIsUiCapable(withSeparatorInside, secret)).toBe(true);
  });

  it('stays a legal Mcp-Session-Id', () => {
    expect(markSessionIdUiCapable('f'.repeat(36), secret)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('ui resources', () => {
  it('advertises the round-status card under the ui:// scheme with the SEP-1865 mime type', () => {
    const descriptors = uiResourceDescriptors();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      uri: ROUND_STATUS_RESOURCE_URI,
      mimeType: MCP_UI_MIME_TYPE,
    });
    expect(ROUND_STATUS_RESOURCE_URI.startsWith('ui://')).toBe(true);
    // Descriptors carry no bodies — `resources/read` serves those.
    expect(descriptors[0]).not.toHaveProperty('text');
    expect(mcpUiServerCapability()).toEqual({ [MCP_UI_EXTENSION]: { mimeTypes: [MCP_UI_MIME_TYPE] } });
  });

  it('reads the card by uri and nothing else', () => {
    const resource = readUiResource(ROUND_STATUS_RESOURCE_URI);
    expect(resource?.mimeType).toBe(MCP_UI_MIME_TYPE);
    expect(resource?.text).toContain('<!doctype html>');
    expect(resource?.text).toContain('The agent has stopped');
    expect(resource?.text).toContain("verdict.deliveryId ? 'Watch Studio' : 'Continue building'");
    expect(resource?.text).toContain('Nothing has been delivered yet. Continue building');
    expect(resource?.text).not.toContain('ask your agent to poll again');
    expect(resource?.text).not.toContain("addRow('Recheck in'");
    expect(readUiResource('ui://gamedevpl/does-not-exist')).toBeNull();
    expect(readUiResource('https://www.gamedev.pl/')).toBeNull();
    expect(readUiResource('')).toBeNull();
  });

  it('declares its CSP in both shapes, and no origin', () => {
    // Same effect as the deny-all default, but stated: ChatGPT will not accept a
    // template for submission without it, and an empty frameDomains is a deliberate
    // signal that nothing is nested yet (declaring one triggers stricter review).
    for (const meta of [uiResourceDescriptors()[0]?._meta, readUiResource(ROUND_STATUS_RESOURCE_URI)?._meta]) {
      expect(meta).toMatchObject({
        ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } },
        'openai/widgetCSP': { connect_domains: [], resource_domains: [], frame_domains: [] },
      });
      // Not declared on purpose: Claude validates ui.domain against a hash of the
      // connector URL the user typed, which a static resource cannot know.
      expect(meta).not.toHaveProperty('ui.domain');
    }
  });

  it('tells the model what the view learned, once per verdict', () => {
    // When a verdict lands the agent is usually gone, so nothing in the conversation
    // knows it. The host holds this until the next user message.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("request('ui/update-model-context'");
    // Polling must not re-announce the same verdict on every pass.
    expect(html).toContain('if (key === contextKey) return;');
    // Nothing to say while the gate is still running.
    expect(html).toContain("gate.status === 'pending') return;");
    // The report is what a follow-up turn needs; the summary alone would still cost a
    // tool call to find out what broke. Bounded, since it lands in the model's context.
    expect(html).toContain('report: report || null');
    expect(html).toContain('REPORT_CONTEXT_LIMIT');
    expect(html).toContain('truncated; call get_gate_verdict for the rest');
  });

  it('hands out a CSP nobody can mutate, since one object serves every response', () => {
    const csp = uiResourceDescriptors()[0]?._meta.ui.csp as unknown as Record<string, string[]>;
    // Object.freeze is shallow: the arrays needed freezing too.
    expect(() => csp.connectDomains.push('https://evil.example')).toThrow();
    expect(uiResourceDescriptors()[0]?._meta.ui.csp.connectDomains).toEqual([]);
  });

  it('parses as JavaScript — the whole view lives inside a TS template literal', () => {
    // This file is uniquely prone to a class of bug nothing else catches: a backtick,
    // a ${, or a \n written in a comment or string is consumed by TypeScript and lands
    // in the emitted view as a real character, breaking its script. tsc is happy, the
    // string-matching tests below are happy, and the card renders blank in production.
    // Caught exactly this way once, by the browser harness rather than by CI.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    const open = html.indexOf('<script>');
    const close = html.lastIndexOf('</script>');
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const script = html.slice(open + '<script>'.length, close);
    expect(() => new Function(script)).not.toThrow();
  });

  it('is self-contained, because the host CSP is deny-all and we declare no domains', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|import\s*\(/);
  });

  it('speaks the view side of the lifecycle: handshake, tool results, teardown', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('ui/initialize');
    expect(html).toContain('ui/notifications/initialized');
    expect(html).toContain('ui/notifications/tool-result');
    expect(html).toContain('ui/notifications/size-changed');
    expect(html).toContain('ui/resource-teardown');
    // Only the embedding host may drive this view.
    expect(html).toContain('event.source !== host');
    // Strict mode is on, so the teardown handler must be a named function, not
    // arguments.callee — which throws there.
    expect(html).not.toContain('arguments.callee');
  });

  it('opens the round view from the tools a creator watches a round through', () => {
    // Phase 0 attached the view to read tools only, on the reasoning that a card on a
    // write tool would freeze a mid-delivery echo on screen. That no longer applies: the
    // card renders live state from get_round_status rather than the opening payload, so
    // submitting is exactly the moment a creator wants it open.
    expect(MCP_UI_TOOL_RESOURCES).toEqual({
      start: ROUND_STATUS_RESOURCE_URI,
      get_gate_verdict: ROUND_STATUS_RESOURCE_URI,
    });
    // The host renders one card per tool call carrying _meta.ui, so a turn that started
    // a round and then delivered produced two identical cards. The card is live: the one
    // from start already follows the delivery.
    expect(MCP_UI_TOOL_RESOURCES).not.toHaveProperty('submit_sources');
    // open_round mints no session key and takes none, so a card opened there would have
    // nothing to read status with.
    expect(MCP_UI_TOOL_RESOURCES).not.toHaveProperty('open_round');
  });

  it('keeps the app-only tools read-only, since the model never sees them happen', () => {
    // A hidden tool that writes is an audit hole: nothing in the transcript records it.
    expect([...MCP_UI_APP_ONLY_TOOLS]).toEqual(['get_round_status', 'get_round_media']);
    expect([...MCP_UI_APP_ONLY_TOOLS].every((name) => name.startsWith('get_'))).toBe(true);
  });

  it('does not paint a failure for the poll it makes before it has a key', () => {
    // Observed in Claude: the first poll goes out before the opening tool's key
    // arrives, and Claude refuses it. Rendering that as an error flashed
    // "Could not read round status here." across the card a moment before it filled in.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('speculative');
    // A key that never arrives is still a real failure — but on a timer, not instantly.
    expect(html).toContain('giveUpTimer');
    expect(html).toContain('Could not read round status here.');
  });

  it('retries when the key lands while the keyless poll is still in flight', () => {
    // noteSessionKey's own poll() is dropped as already-in-flight, so the refusal
    // handler has to retry or the card waits out the whole give-up timer holding a
    // usable credential. Reproduced in the browser harness: without this, the view
    // makes exactly one call and never recovers.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toMatch(/if \(speculative\) \{[\s\S]{0,400}?if \(sessionKey\) \{[\s\S]{0,80}?poll\(\);/);
  });

  it('offers the creator the next move, in the exact ui/message shape the spec defines', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("method: 'ui/message'");
    // SEP-1865: params are { role, content: { type, text } } — a guessed shape would
    // produce a button that silently does nothing.
    expect(html).toContain("params: { role: 'user', content: { type: 'text', text: action.text } }");
    // One action per gate outcome a creator can actually respond to.
    for (const status of ['kit_outdated', 'red', 'preview_failed', 'preview_passed']) {
      expect(html).toContain(`${status}: {`);
    }
    // Only once the agent has stopped: while it is still working it acts on a red gate
    // itself, and a second instruction would talk over it.
    expect(html).toContain('gateStatus && status.agentEnded ? ACTIONS[gateStatus] : null');
    // A host that will not post for us must leave the words on screen to copy.
    expect(html).toContain('actionHint.hidden = false');
  });

  it('does not print the gate detail twice, or lead with instructions meant for the agent', () => {
    // kit_outdated returns the same long agent-facing text as both summary and report,
    // which the card printed twice — once as its headline.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('gateSummary.length <= 180');
    expect(html).toContain('detail !== summary.textContent');
  });

  it('stops polling once the agent has stopped and the gate has settled', () => {
    // Nothing further can arrive, so an open tab must not cost a request every 30s
    // for as long as it stays open.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("status.agentEnded && gate && gate.status && gate.status !== 'pending'");
  });

  it('says which way a status read failed, so a screenshot is enough to diagnose it', () => {
    // Observed in ChatGPT: one card read status fine (screenshot, note and gate all
    // live) while a later one in the same session did not. "Could not read round status
    // here." cannot distinguish "this view was never handed a round key" from "the host
    // refused the call", and those need opposite fixes.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('lastFailure');
    expect(html).toContain('was never given a round key');
    expect(html).toContain('The status call was refused.');
    expect(html).toContain("'with a round key, ' : 'without a round key, '");
  });

  it("shows the gate's own frames, which the agent has no browser to capture", () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("name: 'get_round_media'");
    // data: URIs render in both hosts (verified in Claude and ChatGPT), which is what
    // makes carrying the bytes viable at all — a signed URL would be blocked by the CSP.
    expect(html).toContain("'data:image/png;base64,'");
    // Fetched once per delivery, not once per poll: the strip does not change between
    // polls and each frame is hundreds of kilobytes through the host.
    expect(html).toContain('mediaKey === gate.deliveryId');
    expect(html).toContain("gate.status === 'pending'");
    // A frame written a moment after the verdict loses the first read; one retry, then
    // stop, so a card cannot re-ask forever.
    expect(html).toContain('mediaTries < 2');
    // Megabytes cannot ride a postMessage and the CSP declares no domains, so the video
    // is handed to the host to open rather than embedded.
    expect(html).toContain("request('ui/open-link'");
    // Never claims a complete strip when the budget dropped frames.
    expect(html).toContain('framesOmitted');
    // A run with no media says so instead of rendering an empty strip.
    expect(html).toContain("'No frames: '");
  });

  it("clears a previous delivery's frames when it falls back to the opening payload", () => {
    // Otherwise the strip from the last round stays on screen under a fresh verdict.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toMatch(/gallery\.hidden = true;[\s\S]{0,80}galleryCap\.hidden = true;/);
  });

  it('polls, and degrades to the opening payload when a host refuses the app-only call', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("name: 'get_round_status'");
    expect(html).toContain('retryAfterSeconds');
    // Stops on its own rather than polling a finished round forever.
    expect(html).toContain('isFinished');
    // The fallback path: no app-only tool call, no broken card.
    expect(html).toContain('renderGateOnly');
  });
});
