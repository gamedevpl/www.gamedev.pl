// Pure, so the guard's own rule can be tested against fixtures.
//
// A `_VAL` is computed in the deploy file right before ENV_VARS is built, folding a repo
// variable together with its default. Threading one the file never assigns reaches Cloud
// Run empty while the name check still passes -- that is how a kill switch ships dead.
//
// The contract, exactly: an assignment counts when it is a top-level command of the
// form NAME=, export NAME= or eval "NAME=, on an uncommented line that precedes the
// ENV_VARS expansion. Not modelled, on purpose: shell control flow. An assignment under
// `if false` or inside an uncalled function is accepted. This guards one convention in
// two files we own, against the mistakes actually made in them; a shell parser would be
// a larger surface than the thing it guards. If a deploy file grows conditional setup,
// extend the fixtures first.

// Only the shapes the deploy files use, anchored to the start of a command,
// so `echo "NAME=..."` or `: # NAME=...` earlier in the file cannot satisfy it.
const ASSIGNMENT = (name) => new RegExp(`^\\s*(?:export\\s+|eval\\s+")?${name}=`);

function executable(line) {
  const trimmed = line.trimStart();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

export function unsetValueRefs(source) {
  const lines = source.split('\n');
  const missing = new Set();
  lines.forEach((line, index) => {
    if (!/\bENV_VARS=/.test(line)) return;
    for (const ref of line.matchAll(/=\$\{([A-Z][A-Z0-9_]*_VAL)\}/g)) {
      const name = ref[1];
      const assignedBefore = lines
        .slice(0, index)
        .some((earlier) => executable(earlier) && ASSIGNMENT(name).test(earlier));
      if (!assignedBefore) missing.add(name);
    }
  });
  return missing;
}
