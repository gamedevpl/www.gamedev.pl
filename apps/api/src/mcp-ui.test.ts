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

  it('allowlists the one place the card may send the reader', () => {
    // The card fetches nothing, so an empty CSP is right for *fetching*. Link targets
    // are a different question and were never answered: ChatGPT gates external links
    // behind redirect_domains, and the standard ui.csp has no equivalent field — so
    // without this the card's own "Watch the gate recording" button is a link the host
    // has no permission to follow.
    const [descriptor] = uiResourceDescriptors();
    const legacy = descriptor._meta['openai/widgetCSP'];
    // The submission requirement, on the openai/* key only. The standard ui.domain is
    // validated by Claude against a value it derives itself, so declaring our origin
    // there broke the card in production once (#593, reverted in #595).
    expect(descriptor._meta['openai/widgetDomain']).toBe('https://www.gamedev.pl');
    expect(descriptor._meta.ui).not.toHaveProperty('domain');
    expect(legacy.redirect_domains).toEqual(['https://www.gamedev.pl']);
    // Only our own site. A wider list would let a future card hand the host somewhere
    // we did not intend.
    expect(legacy.redirect_domains.every((domain) => domain.startsWith('https://'))).toBe(true);
    // What it may *fetch* stays empty — the card inlines everything.
    expect(legacy.connect_domains).toEqual([]);
    expect(legacy.resource_domains).toEqual([]);
    expect(legacy.frame_domains).toEqual([]);
    // Same body on read as on list, so a host cannot see two different policies.
    expect(readUiResource(ROUND_STATUS_RESOURCE_URI)?._meta).toEqual(descriptor._meta);
  });

  it('opens the round view from exactly one tool, which exists for nothing else', () => {
    // This used to be `start` and `get_gate_verdict` — tools an agent calls for its own
    // reasons — which made a card a side effect of workflow mechanics. An agent that
    // re-ran `start` before each operation left one card per call (ChatGPT, 2026-08-05),
    // and it was not doing anything wrong enough to forbid. Showing the creator
    // something is now a deliberate act with a deliberate tool.
    expect(MCP_UI_TOOL_RESOURCES).toEqual({
      show_round: ROUND_STATUS_RESOURCE_URI,
      // Second intent, same card. get_gate_media puts frames in front of the *model*,
      // which can look at them and cannot show them — a view is the only surface that
      // reaches the creator, so "show me the screenshots" needs one too.
      show_media: ROUND_STATUS_RESOURCE_URI,
    });

    // The host renders one card per call carrying _meta.ui, so every tool added here
    // hands the card count back to whatever the agent happens to do.
    for (const workflowTool of ['start', 'get_gate_verdict', 'submit_sources', 'open_round']) {
      expect(MCP_UI_TOOL_RESOURCES).not.toHaveProperty(workflowTool);
    }
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

  it('asks for the height its content needs, not the height of the frame it was given', () => {
    // documentElement.scrollHeight was the content height until applyContainerDimensions
    // began setting html{height:100%} to fill a host-declared frame. After that the card
    // filled 400px, reported 400px, and the host never shrank it — a slab of empty space
    // under the content. Measuring the card breaks the loop. Mutation-checked in the
    // browser: reverting to scrollHeight reports 520 where this reports 287.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("var card = document.querySelector('.card');");
    expect(html).toContain('card.getBoundingClientRect().height');
  });

  it('opens the wordmark and the game name through the host', () => {
    // Anchors are inert here: the view is sandboxed without allow-top-navigation, so
    // ui/open-link is the only way out. Both origins come from canonicalAppBaseUrl, the
    // same function the redirect allowlist is built from, so they cannot fall outside it.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('function linkify(element, url, label)');
    expect(html).toContain("linkify(brandEl, status.siteUrl, 'Open gamedev.pl')");
    expect(html).toContain('linkify(titleEl, status.studioUrl,');
    // The title goes to Studio rather than /play: the Play button already covers play,
    // and Studio is valid whether or not anything is playable yet.
    expect(html).not.toContain('linkify(titleEl, status.playUrl');
    // A missing URL removes the affordance rather than leaving a dead click target.
    expect(html).toContain("element.className.replace(/ ?linked/, '')");
  });

  it('invites the creator to play, once there is something to play', () => {
    // The step the whole flow exists for: the card shows what the agent built, the
    // theater is where it gets played. A link rather than an embedded game on purpose —
    // gamedev.pl's theater does fullscreen, pointer lock and touch; a chat card cannot.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('renderPlay');
    // The URL comes from the server (playUrlFor), never baked into the view — one
    // string is served to every environment, so an origin here would send a staging
    // card's Play button to production. The self-contained test above enforces it.
    expect(html).toContain('status.playUrl');
    // The link and the allowlist that permits it come from one function, so they cannot
    // disagree — they did once, and every production link was non-allowlisted.
    expect(html).not.toContain('https://www.gamedev.pl/play/');
    // Uses the same host hand-off the gate recording does — the mechanism whose
    // permission (`redirect_domains`) was missing until the CSP work.
    expect(html).toMatch(/playBtn\.onclick[\s\S]{0,120}?request\('ui\/open-link'/);

    // Not offered when a round has delivered nothing: the link would open a page saying
    // the game is not available, which is a worse answer than no button.
    for (const phase of ['ready_for_review', 'published']) {
      expect(html).toContain(`status.phase === '${phase}'`);
    }
    expect(html).toContain("gateStatus === 'preview_passed'");
    // needs_changes is deliberately absent: a publish run that fails before assembly
    // lands there with neither a bundle nor a preview, so the button would have sent
    // the creator to the "not available yet" page it exists to avoid. A red gate is
    // exactly when there may be nothing to play.
    expect(html).not.toContain("status.phase === 'needs_changes' ||");
    expect(html).toContain('playRow.hidden = true;');
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

  it('turns the button into a copy control when the host refuses to post for us', () => {
    // Claude refuses ui/message (owner test, 2026-08-05), and the spec version we target
    // has no host capability to ask in advance — so this is the normal path, not the
    // exception. Restoring the original label and printing the text underneath read as
    // "the button did nothing": nothing told the creator the words were now theirs.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('offerToCopy');
    expect(html).toContain("'Copy for your agent'");
    expect(html).toContain('This chat app will not send it for you');

    // Selection first and unconditionally: it needs no permission and always works, so
    // the click visibly does something whatever the clipboard decides. A Copy button
    // that silently fails is the dead button one level down.
    expect(html).toContain('selection.addRange(range)');
    expect(html).toContain("'Selected — press Ctrl/Cmd+C'");
    // ...but only claimed when it actually took. A missing element or a host that
    // returns no Selection would otherwise throw inside the click handler and leave the
    // dead button this whole path exists to remove.
    expect(html).toMatch(/if \(selected\) actionBtn\.textContent/);
    expect(html).toContain('window.getSelection && window.getSelection()');
    // Clipboard is the shortcut, never the mechanism — it needs a sandbox permission the
    // host may not have granted, and rejects unhandled would be an unhandled rejection.
    expect(html).toMatch(/navigator\.clipboard[\s\S]{0,400}?function \(\) \{\}/);
  });

  it('does not put a pill on the card that contradicts the sentence under it', () => {
    // Observed: DISPATCHED above "The agent has stopped without delivering." The phase
    // lags reality, which the summary already accounts for by ranking it last — the
    // pill was left on the old rule and disagreed with the text beside it.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toMatch(/headline =[\s\S]{0,320}?status\.agentEnded[\s\S]{0,40}?'stopped'/);
    // A delivery in flight reads as gating rather than whatever the job record still says.
    expect(html).toMatch(/gate && gate\.deliveryId[\s\S]{0,40}?'gating'/);
    // The new state needs a colour, or it falls through to an unstyled pill.
    expect(html).toContain('.pill-stopped');
  });

  it('states a stall once, not once per shape', () => {
    // "The agent has stopped." sat in the Note row under a summary reading "The agent
    // has stopped without delivering." — same fact twice. Whole-string comparison could
    // not see that one contains the other.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("summary.textContent.indexOf(stallLine.replace(/\\.$/, '')) === -1");
  });

  it('does not print the gate detail twice, or lead with instructions meant for the agent', () => {
    // Settled gates lead with GATE_COPY; agent summaries stay in details.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('GATE_COPY[gateStatus]');
    expect(html).toContain('looksAgentFacing');
    expect(html).toContain("detail && detail === summary.textContent) detail = ''");
  });

  it('pulses live phases and keeps operator metadata behind Technical details', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('pill-live');
    expect(html).toContain('gd-pulse-sq');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('PREVIEW_GATE_STAGES');
    expect(html).toContain('Technical details');
    expect(html).toContain('setDetailsVisible');
    expect(html).toContain('report-fail');
    expect(html).toContain('preferFailSurface');
    expect(html).toContain('Preview check passed. Keep iterating');
    expect(html).not.toContain('the game runs');
    expect(html).not.toMatch(/GATE_COPY[\s\S]{0,400}?submit_sources/);
  });

  it('surfaces presence / progress as a live activity line while building or gating', () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('PRESENCE_COPY');
    expect(html).toContain('id="activity"');
    expect(html).toContain('setActivity');
    expect(html).toContain('id="stages"');
    expect(html).toContain("'Typecheck'");
    // Preview omits Capture (stills are advisory / killable); publish still lists it.
    expect(html).toContain("var PREVIEW_GATE_STAGES = ['Typecheck', 'Smoke', 'Build']");
    expect(html).toContain("'Capture'");
    // Quiet/ended stalls must not keep pulsing a stale presence line.
    expect(html).toContain("status.stall === 'quiet'");
    expect(html).toContain('agentQuiet');
  });

  it('keeps polling after a fixable gate refusal so a resumed agent refreshes the card', () => {
    // Observed 2026-08-06: PREVIEW FAILED + agentEnded froze the card while Claude
    // staged fixes above it. Fixable verdicts must stay live — but only after terminal
    // phases are checked, or a canceled round with a leftover preview_failed would poll
    // forever (review, #627).
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("gate.status === 'preview_failed'");
    expect(html).toContain("gate.status === 'kit_outdated'");
    const canceledAt = html.indexOf("status.phase === 'canceled'");
    const previewFailedAt = html.indexOf("gate.status === 'preview_failed'");
    expect(canceledAt).toBeGreaterThan(-1);
    expect(previewFailedAt).toBeGreaterThan(canceledAt);
    // Still stop once a publish gate is green (or the round is truly terminal).
    expect(html).toContain("gate.status === 'green') return true");
  });

  it('stops polling once the agent has stopped and the gate has settled', () => {
    // Nothing further can arrive, so an open tab must not cost a request every 30s
    // for as long as it stays open — except fixable refusals (see above).
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("status.agentEnded && gate && gate.status && gate.status !== 'pending'");
  });

  it('names the round it is watching, so duplicate cards can be told apart', () => {
    // ChatGPT showed several near-identical cards for one session. The call ledger
    // proved `start` ran exactly twice and `get_gate_verdict` never, and our tools/list
    // attaches the template to those two tools only — so the pixels are consistent with
    // "one card per start" and with "the host rendered one call twice", and nothing on
    // screen distinguished them. The round does.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("addRow('Round', status.round)");
  });

  it('shows our message, not the exception wrapper a host puts around it', () => {
    // A refused call surfaced as: Error code: INVALID_ARGUMENT; Error: RuntimeException:
    // Error calling MCP tool: [TextContent(type='text', text='{"error":"OAuth access
    // proves your identity only — call start()… — printed verbatim and cut off
    // mid-sentence. The only actionable part is the JSON inside it.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('function ourError(raw)');
    // No closing quote required: the host truncates its own wrapper, so the message
    // that actually arrives has no terminator. Demanding one matched nothing.
    expect(html).toContain('/"error"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)/');
    // And a blob with no JSON of ours in it is trimmed rather than dumped whole.
    expect(html).toContain('text.slice(0, 160)');
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

    // Appended, not substituted: the static fallback may have just put the gate's own
    // report in that block, and a note about our polling must not evict it.
    expect(html).toContain("report.textContent + '\\n\\n' + diagnostic");

    // Never JSON.stringify a value the host handed us. Structured clone carries cycles,
    // and this runs inside the message handler — a throw there takes the card's whole
    // update path down, turning a failed read into a frozen card.
    expect(html).not.toContain('JSON.stringify(error)');
  });

  it('loads frames for a named delivery, not only the round it is watching', () => {
    // The gallery hung off the current round's gate, so a creator asking "show me the
    // screenshot" got nothing: that request opens a round which has delivered nothing,
    // and the frames they meant belong to the previous one.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('status.mediaDeliveryId');
    // Still falls back to the round's own settled gate when no delivery is named.
    expect(html).toMatch(/gate && gate\.deliveryId && gate\.status !== 'pending'/);
    // And the named delivery is what gets fetched.
    expect(html).toContain('var args = { deliveryId: wanted };');
    // Loaded from the opening result — show_media names the delivery up front, so the
    // card must not wait for a gate that will never settle in this round.
    expect(html).toMatch(/render\(opening\);[\s\S]{0,220}?loadMedia\(opening\);/);
  });

  it("shows the gate's own frames, which the agent has no browser to capture", () => {
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain("name: 'get_round_media'");
    // data: URIs render in both hosts (verified in Claude and ChatGPT), which is what
    // makes carrying the bytes viable at all — a signed URL would be blocked by the CSP.
    expect(html).toContain("'data:image/png;base64,'");
    // Fetched once per delivery, not once per poll: the strip does not change between
    // polls and each frame is hundreds of kilobytes through the host.
    expect(html).toContain('mediaKey === wanted');
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

  it('sizes itself to the frame the host gave it, per the spec it implements', () => {
    // Observed in ChatGPT: the card sat at the top of a much taller frame with dead
    // space beneath. SEP-1865 has containerDimensions in hostContext for exactly this —
    // a fixed height is the host's decision and the view is meant to fill it. We were
    // reading theme, locale and timeZone from hostContext and ignoring dimensions.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toContain('applyContainerDimensions');
    expect(html).toContain('context.containerDimensions');
    // Fixed fills, flexible caps — the two modes the spec defines, kept distinct.
    expect(html).toMatch(/dimensions\.height[\s\S]{0,220}?'100%'/);
    expect(html).toContain('dimensions.maxHeight + ');
    // Absent means unbounded: no dimensions, no styling, same as before this existed.
    expect(html).toContain("if (!dimensions || typeof dimensions !== 'object') return;");
  });

  it('paints the round from the opening result, before any poll returns', () => {
    // show_round returns the whole round, so the card no longer has to sit on
    // "Reading round status..." waiting for its first poll — and in a host that refuses
    // the app-only call this is the only state it will ever have. The old seed path
    // recognised a verdict shape only, which show_round does not return.
    const html = readUiResource(ROUND_STATUS_RESOURCE_URI)?.text ?? '';
    expect(html).toMatch(/var opening = unwrap\(message\.params, looksLikeStatus\);/);
    expect(html).toMatch(/if \(opening && !live\) \{[\s\S]{0,120}?render\(opening\);/);
    // The gate-only fallback still exists for anything that is not a full status.
    expect(html).toContain('var verdict = opening ? null : unwrap(message.params, looksLikeVerdict);');

    // And a failed refresh must never trade that content back for an error message.
    // Verified in the browser against a host refusing every app-only call: the card
    // still shows phase, round and deliveries left rather than "Could not read...".
    expect(html).toContain('if (!live && !painted) giveUp();');
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
