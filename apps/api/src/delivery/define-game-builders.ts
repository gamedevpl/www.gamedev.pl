import ts from 'typescript';

const REQUIRED_STEPS = ['input', 'audio', 'init', 'update', 'render', 'snapshot'] as const;

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

export function inspectDefineGameBuilders(
  path: string,
  content: string,
): { usesDefineGame: boolean; findings: string[] } {
  const source = ts.createSourceFile(`/${path}`, content, ts.ScriptTarget.Latest, true);
  const program = ts.createProgram(
    [source.fileName],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (name) => (name === source.fileName ? source : undefined),
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getDirectories: () => [],
      fileExists: (name) => name === source.fileName,
      readFile: () => undefined,
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    },
  );
  const checker = program.getTypeChecker();
  let builders = new Map<ts.Symbol, Set<string>>();
  const findings: string[] = [];
  let usesDefineGame = false;

  function bind(name: ts.Node, steps: Set<string> | null): void {
    const symbol = checker.getSymbolAtLocation(name);
    if (!symbol) return;
    if (steps) builders.set(symbol, steps);
    else builders.delete(symbol);
  }

  function evaluate(expression: ts.Expression): Set<string> | null {
    expression = unwrap(expression);
    if (ts.isFunctionLike(expression)) {
      visit(expression);
      return null;
    }
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      return symbol ? (builders.get(symbol) ?? null) : null;
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const steps = evaluate(expression.right);
      if (ts.isIdentifier(expression.left)) bind(expression.left, steps);
      return steps;
    }
    if (ts.isCallExpression(expression)) {
      const callee = unwrap(expression.expression);
      const receiver = ts.isPropertyAccessExpression(callee) ? evaluate(callee.expression) : null;
      for (const argument of expression.arguments) visit(argument);
      if (!ts.isPropertyAccessExpression(callee)) return null;
      const target = unwrap(callee.expression);
      if (callee.name.text === 'defineGame' && ts.isIdentifier(target) && target.text === 'GameKit') {
        usesDefineGame = true;
        return new Set();
      }
      if (!receiver) return null;
      if (callee.name.text !== 'start') {
        receiver.add(callee.name.text);
        return receiver;
      }
      const missing = REQUIRED_STEPS.filter((step) => !receiver.has(step));
      if (missing.length) {
        const line = source.getLineAndCharacterOfPosition(expression.getStart(source)).line + 1;
        findings.push(`${path}:${line}: missing ${missing.map((step) => `.${step}(...)`).join(', ')}`);
      }
      return null;
    }
    ts.forEachChild(expression, visit);
    return null;
  }

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      bind(node.name, node.initializer ? evaluate(node.initializer) : null);
      return;
    }
    if (ts.isCallExpression(node) || ts.isBinaryExpression(node)) {
      evaluate(node);
      return;
    }
    if (ts.isFunctionLike(node)) {
      const outer = builders;
      const copies = new Map<Set<string>, Set<string>>();
      builders = new Map(
        [...outer].map(([symbol, steps]) => {
          if (!copies.has(steps)) copies.set(steps, new Set(steps));
          return [symbol, copies.get(steps)!];
        }),
      );
      ts.forEachChild(node, visit);
      builders = outer;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return { usesDefineGame, findings };
}
