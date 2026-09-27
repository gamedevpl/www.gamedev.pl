import { parse, type Node } from 'acorn';
import { parse as parseHtml, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';

type SyntaxNode = Node & { [key: string]: unknown };

function isMember(node: unknown, object: string, property: string): boolean {
  const member = node as SyntaxNode | null;
  const target = member?.object as SyntaxNode | undefined;
  const key = member?.property as SyntaxNode | undefined;
  return (
    member?.type === 'MemberExpression' &&
    target?.type === 'Identifier' &&
    target.name === object &&
    (member.computed ? key?.value === property : key?.name === property)
  );
}

export function adaptGameKitMessages(code: string, module = false): string {
  const replacements: { start: number; end: number }[] = [];
  function bindings(value: unknown, names: Set<string>): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    if (node.type === 'Identifier' && ['window', 'parent', 'globalThis'].includes(node.name as string))
      names.add(node.name as string);
    else
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach((value) => bindings(value, names));
        else if (child && typeof child === 'object') bindings(child, names);
      }
  }
  function localNames(value: unknown, root: unknown, names: Set<string>): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    const functionNode = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') bindings(node.id, names);
    if (value !== root && functionNode) return;
    if (functionNode && value === root) bindings(node.id, names);
    if (node.type === 'VariableDeclarator') bindings(node.id, names);
    if (node.type === 'ImportDeclaration') bindings(node.specifiers, names);
    if (functionNode) bindings(node.params, names);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((value) => localNames(value, root, names));
      else if (child && typeof child === 'object') localNames(child, root, names);
    }
  }
  function visit(value: unknown, inherited = new Set<string>()): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    const shadowed = new Set(inherited);
    if (
      ['Program', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'CatchClause'].includes(
        node.type,
      )
    ) {
      localNames(node, node, shadowed);
      if (node.type === 'CatchClause') bindings(node.param, shadowed);
    }
    if (node.type === 'WithStatement') ['window', 'parent', 'globalThis'].forEach((name) => shadowed.add(name));
    if (node.type === 'CallExpression') {
      const callee = node.callee as SyntaxNode;
      const object = callee?.object as SyntaxNode | undefined;
      const property = callee?.property as SyntaxNode | undefined;
      const isParent = object?.type === 'Identifier' && object.name === 'parent' && !shadowed.has('parent');
      const isWindowParent =
        (isMember(object, 'window', 'parent') && !shadowed.has('window')) ||
        (isMember(object, 'globalThis', 'parent') && !shadowed.has('globalThis'));
      if (
        callee?.type === 'MemberExpression' &&
        !shadowed.has('window') &&
        (isParent || isWindowParent) &&
        (callee.computed ? property?.value === 'postMessage' : property?.name === 'postMessage')
      ) {
        replacements.push({ start: callee.start, end: callee.end });
      }
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((value) => visit(value, shadowed));
      else if (child && typeof child === 'object') visit(child, shadowed);
    }
  }
  try {
    visit(parse(code, { ecmaVersion: 'latest', sourceType: module ? 'module' : 'script' }));
  } catch {
    return code;
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, replacement.start) + 'window.__GDPL_DOCUMENT_SEND__' + code.slice(replacement.end);
  }
  return code;
}

export function withFrameDocument(html: string, nonce: string): string {
  // Exclude baked raster bytes from both parsers; restore them unchanged.
  const assets: string[] = [];
  let marker = `__GDPL_RASTER_${nonce}_`;
  while (html.includes(marker)) marker += '_';
  const compact = html.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, (asset) => {
    const index = assets.push(asset) - 1;
    return `${marker}${index}__`;
  });
  const doc = parseHtml(compact);
  let head: DefaultTreeAdapterMap['element'] | null = null;
  function visit(node: DefaultTreeAdapterMap['node']): void {
    if ('tagName' in node && node.tagName === 'head') head = node;
    if ('tagName' in node && node.tagName === 'script') {
      const type = node.attrs.find((attr) => attr.name === 'type')?.value;
      if (
        !node.attrs.some((attr) => attr.name === 'src') &&
        (!type || ['module', 'text/javascript', 'application/javascript'].includes(type))
      ) {
        for (const child of node.childNodes) {
          if ('value' in child) child.value = adaptGameKitMessages(child.value, type === 'module');
        }
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(doc);
  const bootstrap = `<script>(function(){
    var nonce=${JSON.stringify(nonce).replaceAll('<', '\\u003c')},host=parent,send=host.postMessage.bind(host),channel=new MessageChannel();
    var Event=MessageEvent,dispatch=window.dispatchEvent.bind(window),post=channel.port1.postMessage.bind(channel.port1);
    var close=channel.port1.close.bind(channel.port1);
    var getData=Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MessageEvent.prototype,'data').get);
    Object.defineProperty(window,'__GDPL_DOCUMENT_SEND__',{value:function(payload){
      post({payload:payload,documentNonce:nonce});
    },writable:false,configurable:false});
    channel.port1.onmessage=function(event){dispatch(new Event('message',{data:getData(event),source:host}));};
    channel.port1.start();
    window.addEventListener('pagehide',function(){
      post({payload:{type:'gdpl-document-retired'},documentNonce:nonce});close();
    },true);
    document.currentScript.remove();
    send({type:'gdpl-document-ready',documentNonce:nonce},'*',[channel.port2]);
  })();</script>`;
  if (head) {
    const script = parseFragment(bootstrap).childNodes[0]!;
    const target = head as DefaultTreeAdapterMap['element'];
    script.parentNode = target;
    target.childNodes.unshift(script);
  }
  const rendered = serialize(doc);
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return rendered.replace(new RegExp(`${escapedMarker}(\\d+)__`, 'g'), (_, index: string) => assets[Number(index)]!);
}
