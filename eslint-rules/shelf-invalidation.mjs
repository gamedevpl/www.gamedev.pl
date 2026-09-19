/**
 * A shelf-visible `submissions` or `gameAccess` write must run inside a guarded transaction.
 *
 * `shelves/{ownerUid}` answers `/api/submissions/mine` in two reads instead of 553, and
 * the reader's fence — a `count()` of the owner's raw `ownerUid` query — cannot see a
 * membership change, a transfer, a settlement, an erasure, or a round written by another
 * member of a shared game. Nine review findings on #1416 were that one defect in nine
 * places, each fixed by invalidating the affected shelves by hand.
 *
 * The guarantee is `GuardedFirestore`: `FirestoreStore` hands every slice a handle whose
 * `runTransaction` tombstones the shelves its writes can be seen on, and a slice that
 * declares a bare `Firestore` does not type-check. This rule covers what a type cannot —
 * a write made outside a transaction, where there is no seam to hook into.
 *
 * Those writes are legitimate; most are setters whose store wrapper calls
 * `shelfMirror.afterJobWrite`. Rather than a disable comment per line, they are listed
 * in INVALIDATED_BY_CALLER below, the same shape `metered-call` uses for its gates: what
 * invalidates what stays readable in one place, and a new one has to join it deliberately.
 *
 * It fires only where the patch can be seen on a shelf: a literal naming none of
 * `ShelfRound`'s fields is ignored, a spread or a non-literal is assumed to carry them.
 * Deliberately coarse beyond that, like `metered-call` — it cannot tell whether the
 * invalidation is correct, only that somebody was made to name one. It also resolves names
 * syntactically, so a ref laundered through a destructured array element (the erase path's
 * WriteBatch) is a known blind spot; that path tombstones in `erase-account.ts`.
 */

const GUARDED_COLLECTIONS = new Set(['submissions', 'gameAccess']);
const WRITE_METHODS = new Set(['set', 'update', 'create', 'delete']);

// Kept in step with ShelfRound in apps/api/src/store/records/shelf.ts.
const MIRRORED_FIELDS = new Set([
  'jobId',
  'createdAt',
  'ownerUid',
  'title',
  'slug',
  'state',
  'abandonedAt',
  'publishedAt',
  'lastStatus',
  'lastNotifiedStatus',
  'previewVersion',
  'deliveredVersion',
  'draftSharedAt',
]);

/**
 * Writers whose invalidation lives at their caller, and what it is.
 *
 * A slice method cannot rebuild a shelf: it holds a jobId, and the mirror needs the
 * owner plus their whole round list. The store wrapper is where both are in hand, so
 * that is where `afterJobWrite` belongs — and this map is the record of it.
 */
const INVALIDATED_BY_CALLER = {
  'store/slices/submission.ts': {
    createSubmission: 'shelfMirror.rebuild, in firestore.ts',
    setSubmissionTitle: 'shelfMirror.afterJobWrite, in submission-facade.ts',
    setSubmissionDeliveredVersion: 'shelfMirror.afterJobWrite, in submission-facade.ts',
    setSubmissionPreviewVersion: 'shelfMirror.afterJobWrite, in submission-facade.ts',
    setSubmissionPublishedAt: 'shelfMirror.afterJobWrite, in firestore.ts',
    setSubmissionAbandoned: 'shelfMirror.afterJobWrite, in firestore.ts',
    setDraftShared: 'shelfMirror.afterJobWrite, in firestore.ts',
    // The spread adds specIsSystemGenerated; spec and qa are not mirrored.
    setSubmissionBrief: 'nothing: no mirrored field is written',
  },
  'store/slices/build-log.ts': {
    // Both spread agentEndedAt/agentEndedBy deletes, which the shelf never shows.
    appendBuildEvent: 'nothing: no mirrored field is written',
    touchLastAgentSignalAt: 'nothing: no mirrored field is written',
  },
};

function allowedWriter(filename, method) {
  const normalized = String(filename).split('\\').join('/');
  for (const [suffix, methods] of Object.entries(INVALIDATED_BY_CALLER)) {
    if (normalized.endsWith(suffix) && method && method in methods) return true;
  }
  return false;
}

// Narrowing calls that keep a query on the same collection.
const QUERY_STEPS = new Set(['where', 'orderBy', 'limit', 'select', 'startAfter', 'count', 'get']);

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'AwaitExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression' ||
      current.type === 'TSAsExpression')
  ) {
    current = current.expression ?? current.argument;
  }
  return current;
}

// A patch with no mirrored key cannot change what a shelf shows.
function patchIsInvisible(patch) {
  const node = unwrap(patch);
  if (!node || node.type !== 'ObjectExpression') return false;
  for (const property of node.properties) {
    if (property.type !== 'Property') return false;
    const key = property.key?.name ?? property.key?.value;
    if (property.computed || key === undefined) return false;
    if (MIRRORED_FIELDS.has(key)) return false;
  }
  return true;
}

export const shelfInvalidation = {
  meta: {
    type: 'problem',
    docs: { description: 'Shelf-visible submissions/gameAccess writes must run in a guarded transaction.' },
    schema: [],
    messages: {
      unguarded:
        'This writes a shelf-visible "{{collection}}" document outside a guarded transaction, ' +
        'so nothing invalidates the shelves it can be seen on. Move it into a GuardedFirestore ' +
        'runTransaction, or add this writer to INVALIDATED_BY_CALLER in ' +
        'eslint-rules/shelf-invalidation.mjs, naming what invalidates the shelf instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    // The method a write sits in, which is what the map above names.
    const methodStack = [];
    // Parameters bound by a runTransaction callback: the guarded seam itself.
    const transactionParams = new Set();
    // Class members, addressed as `this.name`; one map, file-wide.
    const memberCollections = new Map();
    const memberDocuments = new Map();
    // Locals, which a sibling method may reuse for another collection entirely.
    const scopes = [{ collections: new Map(), documents: new Map() }];
    const localCollection = (name) => scopes.findLast((scope) => scope.collections.has(name))?.collections.get(name);
    const localDocument = (name) => scopes.findLast((scope) => scope.documents.has(name))?.documents.get(name);

    function collectionOf(expression) {
      const node = unwrap(expression);
      if (!node) return null;
      if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
        const method = node.callee.property?.name;
        if (method === 'collection') {
          const argument = node.arguments?.[0];
          return argument?.type === 'Literal' ? String(argument.value) : null;
        }
        if (QUERY_STEPS.has(method)) return collectionOf(node.callee.object);
        return memberCollections.get(method) ?? null;
      }
      if (node.type === 'CallExpression') return collectionOf(node.callee);
      if (node.type === 'Identifier') return localCollection(node.name) ?? null;
      if (node.type === 'MemberExpression') {
        // A snapshot's rows sit in the collection the query named.
        if (node.property?.name === 'docs') return collectionOf(node.object);
        return memberCollections.get(node.property?.name) ?? null;
      }
      return null;
    }

    function documentOf(expression) {
      const node = unwrap(expression);
      if (!node) return null;
      if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
        // `<collection>.doc(id)` is the only way to name a document.
        if (node.callee.property?.name === 'doc') return collectionOf(node.callee.object);
        return memberDocuments.get(node.callee.property?.name) ?? null;
      }
      if (node.type === 'CallExpression') return documentOf(node.callee);
      if (node.type === 'Identifier') return localDocument(node.name) ?? null;
      if (node.type === 'MemberExpression') {
        // `doc.ref` — a row of a query, so the query's collection.
        if (node.property?.name === 'ref') return documentOf(node.object) ?? collectionOf(node.object);
        return memberDocuments.get(node.property?.name) ?? null;
      }
      return null;
    }

    const remember = (collections, documents, name, expression) => {
      if (!name || !expression) return;
      const collection = collectionOf(expression);
      if (collection) collections.set(name, collection);
      const document = documentOf(expression);
      if (document) documents.set(name, document);
    };

    const rememberMember = (name, expression) => remember(memberCollections, memberDocuments, name, expression);

    const rememberLocal = (name, expression) => {
      const scope = scopes[scopes.length - 1];
      remember(scope.collections, scope.documents, name, expression);
    };

    // The lone expression a one-line helper returns, if it has one.
    const returnedExpression = (body) => {
      if (!body) return null;
      if (body.type !== 'BlockStatement') return body;
      const statements = body.body.filter((statement) => statement.type === 'ReturnStatement');
      return statements.length === 1 ? statements[0].argument : null;
    };

    return {
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
        scopes.push({ collections: new Map(), documents: new Map() });
        const parent = node.parent;
        if (parent?.type !== 'CallExpression') return;
        if (parent.callee?.type !== 'MemberExpression') return;
        if (parent.callee.property?.name !== 'runTransaction') return;
        const first = node.params?.[0];
        if (first?.type === 'Identifier') transactionParams.add(first.name);
      },
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression:exit'() {
        if (scopes.length > 1) scopes.pop();
      },
      MethodDefinition(node) {
        methodStack.push(node.key?.name);
        rememberMember(node.key?.name, returnedExpression(node.value?.body));
      },
      'MethodDefinition:exit'() {
        methodStack.pop();
      },
      PropertyDefinition(node) {
        rememberMember(node.key?.name, node.value);
      },
      VariableDeclarator(node) {
        if (node.id?.type === 'Identifier') rememberLocal(node.id.name, node.init);
      },
      ForOfStatement(node) {
        const declaration = node.left?.declarations?.[0];
        if (declaration?.id?.type === 'Identifier') rememberLocal(declaration.id.name, node.right);
      },
      CallExpression(node) {
        if (node.callee?.type !== 'MemberExpression') return;
        const method = node.callee.property?.name;
        if (!WRITE_METHODS.has(method)) return;

        const receiver = node.callee.object;
        // Inside runTransaction the guard is already doing this work.
        if (receiver?.type === 'Identifier' && transactionParams.has(receiver.name)) return;

        // `tx.set(ref, data)` shape first, then `ref.set(data)`.
        const viaArgument = documentOf(node.arguments?.[0]);
        const collection = viaArgument ?? documentOf(receiver);
        if (!collection || !GUARDED_COLLECTIONS.has(collection)) return;

        const patch = viaArgument ? node.arguments?.[1] : node.arguments?.[0];
        if (method !== 'delete' && patchIsInvisible(patch)) return;
        if (allowedWriter(filename, methodStack[methodStack.length - 1])) return;
        context.report({ node, messageId: 'unguarded', data: { collection } });
      },
    };
  },
};

export default { rules: { 'shelf-invalidation': shelfInvalidation } };
