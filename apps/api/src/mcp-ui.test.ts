import { describe, expect, it } from 'vitest';
import {
  MCP_UI_EXTENSION,
  MCP_UI_MIME_TYPE,
  MCP_UI_TOOL_RESOURCES,
  ROUND_STATUS_RESOURCE_URI,
  clientDeclaresUi,
  mcpUiEnabled,
  mcpUiServerCapability,
  readUiResource,
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

  it('attaches views to read tools only — a card on a write tool would render mid-delivery', () => {
    expect(MCP_UI_TOOL_RESOURCES).toEqual({ get_gate_verdict: ROUND_STATUS_RESOURCE_URI });
  });
});
