import { describe, expect, it } from 'vitest';
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
});
