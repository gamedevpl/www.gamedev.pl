import { describe, expect, it, vi } from 'vitest';
import { parse as parseJavaScript } from 'acorn';
import { parse as parseHtml } from 'parse5';

vi.mock('acorn', async (original) => {
  const actual = await original<typeof import('acorn')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});
vi.mock('parse5', async (original) => {
  const actual = await original<typeof import('parse5')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});
import { adaptGameKitMessages, withFrameDocument } from './frameBootstrap.js';

describe('embedded GameKit transport compatibility', () => {
  it('adapts SDK senders without changing comments, strings, or child-window messaging', () => {
    const code = `// parent.postMessage('comment','*');
      const text="window.parent.postMessage('text','*')";
      window.parent.postMessage({ns:'gdp',v:1},'*');
      parent.postMessage({source:'gdpl-player'},'*');
      globalThis.parent['postMessage']({t:'save:load'},'*');
      child.postMessage({},'*');`;
    const result = adaptGameKitMessages(code);
    expect(result.match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(3);
    expect(result).toContain("// parent.postMessage('comment','*');");
    expect(result).toContain(`const text="window.parent.postMessage('text','*')";`);
    expect(result).toContain("child.postMessage({},'*');");
  });

  it('leaves invalid JavaScript to the browser without authorizing its raw messages', () => {
    expect(adaptGameKitMessages('parent.postMessage({')).toBe('parent.postMessage({');
  });

  it('preserves local objects named parent or window', () => {
    const code = `function one(parent){parent.postMessage({local:true},'*');}
      function two(){const window={parent:{postMessage(){}}};window.parent.postMessage({},'*');}
      parent.postMessage({global:true},'*');`;
    const adapted = adaptGameKitMessages(code);
    expect(adapted).toContain("parent.postMessage({local:true},'*')");
    expect(adapted).toContain("window.parent.postMessage({},'*')");
    expect(adapted.match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(1);
  });

  it('counts only bound names in destructuring, defaults, and imports', () => {
    const code = `import { parent as node } from 'sdk';
      const { parent: other, x = parent } = value;
      function sender({ window: local }, [entry = globalThis]) { parent.postMessage({}, '*'); }
      parent.postMessage({}, '*');`;
    expect(adaptGameKitMessages(code, true).match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(2);
    expect(adaptGameKitMessages("const { x: parent } = value; parent.postMessage({}, '*');")).not.toContain(
      '__GDPL_DOCUMENT_SEND__',
    );
  });

  it('keeps block, loop, and catch declarations scoped while hoisting var', () => {
    const code = `
      { const parent = local; parent.postMessage({}, '*'); }
      parent.postMessage({}, '*');
      for (let parent of values) { parent.postMessage({}, '*'); }
      parent.postMessage({}, '*');
      try {} catch (parent) { parent.postMessage({}, '*'); }
      parent.postMessage({}, '*');
      function hoisted() { parent.postMessage({}, '*'); { var parent = local; } }
      function lexical() { { let parent = local; } parent.postMessage({}, '*'); }`;
    expect(adaptGameKitMessages(code).match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(4);
    expect(adaptGameKitMessages(`{ let window = local; } window.parent.postMessage({}, '*');`)).toContain(
      '__GDPL_DOCUMENT_SEND__',
    );
  });

  it('keeps function defaults and switch discriminants outside their body declarations', () => {
    const code = `function f(x = parent.postMessage({}, '*')) { var parent; parent.postMessage({}, '*'); }
      switch (parent.postMessage({}, '*')) { case 0: let parent; parent.postMessage({}, '*'); }`;
    expect(adaptGameKitMessages(code).match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(2);
  });

  it('isolates lexical and var declarations inside class static blocks', () => {
    const code = `class C {
      static { const parent = local; parent.postMessage({}, '*'); }
      static { parent.postMessage({}, '*'); { var parent = local; } }
      static { parent.postMessage({}, '*'); }
    }
    parent.postMessage({}, '*');`;
    const adapted = adaptGameKitMessages(code);
    expect(adapted.match(/window\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(2);
    expect(adapted).toContain("const parent = local; parent.postMessage({}, '*')");
    expect(adapted).toContain("parent.postMessage({}, '*'); { var parent = local; }");
  });

  it('uses an unshadowed global receiver when window is a local parameter', () => {
    const code = `function send(window) { parent.postMessage({}, '*'); globalThis.parent.postMessage({}, '*'); window.parent.postMessage({}, '*'); }`;
    const adapted = adaptGameKitMessages(code);
    expect(adapted.match(/globalThis\.__GDPL_DOCUMENT_SEND__/g)).toHaveLength(2);
    expect(adapted).toContain("window.parent.postMessage({}, '*')");
    expect(adaptGameKitMessages(`function send(window, globalThis) { parent.postMessage({}, '*'); }`)).toContain(
      "parent.postMessage({}, '*')",
    );
  });

  it('shares classic bindings across scripts without leaking module declarations', () => {
    const output = withFrameDocument(
      `<html><head>
      <script>const parent = local;</script>
      <script>parent.postMessage('local', '*'); window.parent.postMessage('global', '*');</script>
      <script type="module">parent.postMessage('also-local', '*');</script>
      </head></html>`,
      'nonce',
    );
    expect(output).toContain("parent.postMessage('local', '*')");
    expect(output).toContain("parent.postMessage('also-local', '*')");
    expect(output).toContain("window.__GDPL_DOCUMENT_SEND__('global', '*')");
    const isolated = withFrameDocument(
      `<script type="module">const parent = local;</script>
      <script>parent.postMessage('global', '*');</script>
      <script type="module">parent.postMessage('module-global', '*');</script>`,
      'nonce',
    );
    expect(isolated).toContain("window.__GDPL_DOCUMENT_SEND__('global', '*')");
    expect(isolated).toContain("window.__GDPL_DOCUMENT_SEND__('module-global', '*')");
  });

  it('preserves earlier closures that later classic declarations can shadow', () => {
    const output = withFrameDocument(
      `<script>function send(){parent.postMessage('local', '*');}</script>
      <script>let parent = local; send();</script>`,
      'nonce',
    );
    expect(output).toContain("parent.postMessage('local', '*')");
    expect(output).not.toContain("__GDPL_DOCUMENT_SEND__('local'");
  });

  it('bootstraps before game code, preserves CSP and head attributes, and keeps JSON inert', () => {
    const html = withFrameDocument(
      `<!doctype html><html><head data-test="yes">
      <meta http-equiv="Content-Security-Policy" content="connect-src 'none'">
      <script>parent.postMessage({t:'save:hello'},'*')</script>
      <script type="application/json">{"text":"parent.postMessage()"}</script></head></html>`,
      'nonce',
    );
    expect(html.indexOf('new MessageChannel()')).toBeLessThan(
      html.indexOf("window.__GDPL_DOCUMENT_SEND__({t:'save:hello'}"),
    );
    expect(html).toContain('head data-test="yes"');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('{"text":"parent.postMessage()"}');
    expect(html).toContain('document.currentScript.remove()');
    expect(html).toContain('writable:false,configurable:false');
  });
  it('excludes a full raster-budget asset from both parsers and restores its bytes', () => {
    vi.mocked(parseJavaScript).mockClear();
    vi.mocked(parseHtml).mockClear();
    const asset = 'data:image/png;base64,' + 'A'.repeat(32 * 1024 * 1024);
    const source = `<html><head></head><body><script>window.assets=Object.freeze({hero:"${asset}"});parent.postMessage({t:'save:hello'},'*');</script><img src="${asset}"></body></html>`;
    const result = withFrameDocument(source, 'nonce');
    expect(vi.mocked(parseHtml).mock.calls[0]![0].length).toBeLessThan(1024);
    expect(vi.mocked(parseJavaScript).mock.calls.every(([code]) => code.length < 1024)).toBe(true);
    expect(result).toContain(`hero:"${asset}"`);
    expect(result).toContain(`<img src="${asset}">`);
    expect(result).toContain("window.__GDPL_DOCUMENT_SEND__({t:'save:hello'}");
    expect(result).not.toContain('__GDPL_RASTER_');
  });
});
