import { parse, type Node } from 'acorn';
import { parse as parseHtml, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { insertFrameBootstrap, type AdaptedFrameDocument } from './frameBootstrapScript.js';

type SyntaxNode = Node & { [key: string]: unknown };

const SCOPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'Program',
  'BlockStatement',
  'StaticBlock',
  'CatchClause',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'SwitchStatement',
  'ClassExpression',
  'ClassDeclaration',
  'WithStatement',
]);
const SCRIPT_TYPES = ['', 'module', 'text/javascript', 'application/javascript'];

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

export function adaptGameKitMessages(
  code: string,
  module = false,
  documentBindings = new Set<string>(),
  collectBindings = false,
): string {
  const replacements: { start: number; end: number; receiver: string }[] = [];
  function bindings(value: unknown, names: Set<string>): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    switch (node.type) {
      case 'Identifier':
        if (['window', 'parent', 'globalThis'].includes(node.name as string)) names.add(node.name as string);
        break;
      case 'ObjectPattern':
        (node.properties as SyntaxNode[]).forEach((property) =>
          bindings(property.type === 'RestElement' ? property.argument : property.value, names),
        );
        break;
      case 'ArrayPattern':
        (node.elements as unknown[]).forEach((element) => bindings(element, names));
        break;
      case 'AssignmentPattern':
        bindings(node.left, names);
        break;
      case 'RestElement':
        bindings(node.argument, names);
        break;
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        bindings(node.local, names);
        break;
    }
  }
  function hoistedNames(value: unknown, root: unknown, names: Set<string>): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    // Annex B: sloppy block functions also bind in the enclosing function.
    if (value !== root && node.type === 'FunctionDeclaration') bindings(node.id, names);
    if (
      value !== root &&
      [
        'FunctionDeclaration',
        'FunctionExpression',
        'ArrowFunctionExpression',
        'ClassDeclaration',
        'ClassExpression',
      ].includes(node.type)
    )
      return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var')
      (node.declarations as SyntaxNode[]).forEach((declaration) => bindings(declaration.id, names));
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((value) => hoistedNames(value, root, names));
      else if (child && typeof child === 'object') hoistedNames(child, root, names);
    }
  }
  function lexicalNames(statements: unknown[], names: Set<string>): void {
    for (const value of statements) {
      const node = value as SyntaxNode;
      if (!node) continue;
      if (node.type === 'VariableDeclaration' && node.kind !== 'var')
        (node.declarations as SyntaxNode[]).forEach((declaration) => bindings(declaration.id, names));
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') bindings(node.id, names);
      if (node.type === 'ImportDeclaration')
        (node.specifiers as unknown[]).forEach((specifier) => bindings(specifier, names));
      if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration')
        lexicalNames([node.declaration], names);
    }
  }
  function visit(value: unknown, inherited = new Set<string>()): void {
    if (!value || typeof value !== 'object') return;
    const node = value as SyntaxNode;
    // Only scope nodes copy the set; per-node copies dominated large games.
    const shadowed = SCOPES.has(node.type) ? new Set(inherited) : inherited;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      bindings(node.id, shadowed);
      const params = node.params as unknown[];
      params.forEach((param) => bindings(param, shadowed));
      params.forEach((param) => visit(param, shadowed));
      hoistedNames(node.body, node.body, shadowed);
      visit(node.body, shadowed);
      return;
    }
    if (node.type === 'Program' || node.type === 'StaticBlock') hoistedNames(node, node, shadowed);
    if (['Program', 'BlockStatement', 'StaticBlock'].includes(node.type))
      lexicalNames(node.body as unknown[], shadowed);
    if (node.type === 'CatchClause') bindings(node.param, shadowed);
    if (['ForStatement', 'ForInStatement', 'ForOfStatement'].includes(node.type))
      lexicalNames([node.init ?? node.left], shadowed);
    if (node.type === 'SwitchStatement') {
      visit(node.discriminant, inherited);
      const branches = node.cases as SyntaxNode[];
      lexicalNames(
        branches.flatMap((branch) => branch.consequent as unknown[]),
        shadowed,
      );
      branches.forEach((branch) => visit(branch, shadowed));
      return;
    }
    if (node.type === 'ClassExpression' || node.type === 'ClassDeclaration') bindings(node.id, shadowed);
    if (node.type === 'WithStatement') ['window', 'parent', 'globalThis'].forEach((name) => shadowed.add(name));
    if (node.type === 'CallExpression') {
      const callee = node.callee as SyntaxNode;
      const object = callee?.object as SyntaxNode | undefined;
      const property = callee?.property as SyntaxNode | undefined;
      const isParent = object?.type === 'Identifier' && object.name === 'parent' && !shadowed.has('parent');
      const isWindowParent =
        (isMember(object, 'window', 'parent') && !shadowed.has('window')) ||
        (isMember(object, 'globalThis', 'parent') && !shadowed.has('globalThis'));
      const receiver = !shadowed.has('window') ? 'window' : !shadowed.has('globalThis') ? 'globalThis' : null;
      if (
        callee?.type === 'MemberExpression' &&
        receiver !== null &&
        (isParent || isWindowParent) &&
        (callee.computed ? property?.value === 'postMessage' : property?.name === 'postMessage')
      ) {
        replacements.push({ start: callee.start, end: callee.end, receiver });
      }
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((value) => visit(value, shadowed));
      else if (child && typeof child === 'object') visit(child, shadowed);
    }
  }
  try {
    const tree = parse(code, { ecmaVersion: 'latest', sourceType: module ? 'module' : 'script' });
    if (collectBindings) {
      hoistedNames(tree, tree, documentBindings);
      lexicalNames(tree.body as unknown[], documentBindings);
      return code;
    }
    visit(tree, documentBindings);
  } catch {
    return code;
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    code =
      code.slice(0, replacement.start) + `${replacement.receiver}.__GDPL_DOCUMENT_SEND__` + code.slice(replacement.end);
  }
  return code;
}

// Heavy half: parses HTML and scripts, in a worker when available.
export function adaptFrameDocument(html: string, salt = 'frame'): AdaptedFrameDocument {
  // Exclude baked raster bytes from both parsers; restore them unchanged.
  const assets: string[] = [];
  let marker = `__GDPL_RASTER_${salt}_`;
  while (html.includes(marker)) marker += '_';
  const compact = html.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, (asset) => {
    const index = assets.push(asset) - 1;
    return `${marker}${index}__`;
  });
  const doc = parseHtml(compact);
  let head: DefaultTreeAdapterMap['element'] | null = null;
  const scripts: { text: DefaultTreeAdapterMap['textNode']; module: boolean }[] = [];
  function visit(node: DefaultTreeAdapterMap['node']): void {
    if ('tagName' in node && node.tagName === 'head') head = node;
    if ('tagName' in node && node.tagName === 'script') {
      // Browsers ignore case and MIME parameters here, so the adapter must too.
      const type = (node.attrs.find((attr) => attr.name === 'type')?.value ?? '').split(';')[0]!.trim().toLowerCase();
      if (!node.attrs.some((attr) => attr.name === 'src') && SCRIPT_TYPES.includes(type)) {
        for (const child of node.childNodes) {
          if ('value' in child) scripts.push({ text: child, module: type === 'module' });
        }
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(doc);
  const documentBindings = new Set<string>();
  for (const script of scripts) {
    if (!script.module) adaptGameKitMessages(script.text.value, false, documentBindings, true);
  }
  for (const script of scripts) {
    script.text.value = adaptGameKitMessages(script.text.value, script.module, documentBindings);
  }
  let bootstrap = `<!--__GDPL_BOOTSTRAP_${salt}_`;
  while (html.includes(bootstrap)) bootstrap += '_';
  bootstrap += '-->';
  if (head) {
    const target = head as DefaultTreeAdapterMap['element'];
    target.childNodes.unshift({ nodeName: '#comment', data: bootstrap.slice(4, -3), parentNode: target });
  }
  const rendered = serialize(doc);
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    html: rendered.replace(new RegExp(`${escapedMarker}(\\d+)__`, 'g'), (_, index: string) => assets[Number(index)]!),
    marker: bootstrap,
  };
}

export function withFrameDocument(html: string, nonce: string): string {
  return insertFrameBootstrap(adaptFrameDocument(html, nonce), nonce);
}
