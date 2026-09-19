// Pure, so the guard's own rule can be tested against fixtures.
//
// A `_VAL` is computed in the deploy file right before ENV_VARS is built, folding a repo
// variable together with its default. Threading one the file never assigns reaches Cloud
// Run empty while the name check still passes -- that is how a kill switch ships dead.
//
// Two things a plain "does an assignment exist" regex gets wrong, both proven against the
// real file: an assignment placed after the ENV_VARS line still matches but never ran, and
// a commented-out assignment matches too. Only an executable line that precedes the
// expansion counts.

const ASSIGNMENT = (name) => new RegExp(`(^|[\\s"'])${name}=`);

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
