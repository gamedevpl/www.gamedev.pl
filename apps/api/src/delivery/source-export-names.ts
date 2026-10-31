import { parse, type ParserPlugin } from '@babel/parser';
import type { Node } from '@babel/types';

// Same syntax the build accepts. The first set that parses wins.
const EXPORT_PARSER_PLUGINS: readonly ParserPlugin[][] = [
  ['typescript', 'jsx', 'decorators-legacy'],
  ['typescript', 'jsx', 'decorators'],
];

export type ExportInfo = {
  named: Set<string>;
  hasDefault: boolean;
  // Opaque barrel — skip symbol checks on importers.
  reexportsAll: boolean;
};

function exportedName(node: Node | null | undefined): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

// Binding names, not pattern keys: `export const { a: b } = obj` exports `b`.
function addBindings(id: Node | null | undefined, named: Set<string>): void {
  if (!id) return;
  switch (id.type) {
    case 'Identifier':
      named.add(id.name);
      return;
    case 'ObjectPattern':
      for (const prop of id.properties) {
        if (prop.type === 'RestElement') addBindings(prop.argument, named);
        else if (prop.type === 'ObjectProperty') addBindings(prop.value, named);
      }
      return;
    case 'ArrayPattern':
      for (const element of id.elements) addBindings(element, named);
      return;
    case 'AssignmentPattern':
      addBindings(id.left, named);
      return;
    case 'RestElement':
      addBindings(id.argument, named);
      return;
    default:
      return;
  }
}

function addDeclarationName(declaration: Node, named: Set<string>): void {
  switch (declaration.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSEnumDeclaration':
    case 'TSDeclareFunction':
      if (declaration.id?.type === 'Identifier') named.add(declaration.id.name);
      return;
    case 'VariableDeclaration':
      for (const declarator of declaration.declarations) addBindings(declarator.id, named);
      return;
    case 'TSModuleDeclaration':
      if (declaration.id.type === 'Identifier') named.add(declaration.id.name);
      return;
    default:
      return;
  }
}

// Collect every export name, including later declarators.
export function collectExports(source: string): ExportInfo {
  const named = new Set<string>();
  let hasDefault = false;
  let reexportsAll = false;
  let ast: ReturnType<typeof parse> | null = null;
  for (const plugins of EXPORT_PARSER_PLUGINS) {
    try {
      ast = parse(source, { sourceType: 'module', plugins: [...plugins], errorRecovery: true });
      break;
    } catch {
      ast = null;
    }
  }
  // Unreadable source must not become a false "does not export".
  if (!ast) return { named, hasDefault, reexportsAll: true };

  for (const statement of ast.program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      hasDefault = true;
      continue;
    }
    if (statement.type === 'TSExportAssignment') {
      hasDefault = true;
      continue;
    }
    if (statement.type === 'ExportAllDeclaration') {
      // `export * as ns` is an ExportNamespaceSpecifier, not this node.
      reexportsAll = true;
      continue;
    }
    if (statement.type !== 'ExportNamedDeclaration') continue;
    if (statement.declaration) addDeclarationName(statement.declaration, named);
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ExportNamespaceSpecifier') {
        const name = exportedName(specifier.exported);
        if (name) named.add(name);
        continue;
      }
      if (specifier.type !== 'ExportSpecifier') continue;
      const name = exportedName(specifier.exported);
      if (!name || name === 'default') hasDefault = true;
      else named.add(name);
    }
  }

  // Recovered syntax errors can hide a later export.
  const structural = (ast.errors ?? []).some((error) => !/is not defined/i.test(error.message));
  if (structural) reexportsAll = true;
  if (named.has('default')) hasDefault = true;
  return { named, hasDefault, reexportsAll };
}
