import { describe, expect, it } from 'vitest';
import { unsetValueRefs } from './env-value-refs.mjs';

const expansion = 'ENV_VARS="^|^A=${A}|SHELF_DOCUMENT_READS=${SHELF_DOCUMENT_READS_VAL}"';

describe('unsetValueRefs', () => {
  it('accepts an executable assignment that precedes the expansion', () => {
    const src = ['SHELF_DOCUMENT_READS_VAL="${SHELF_DOCUMENT_READS:-true}"', expansion].join('\n');
    expect([...unsetValueRefs(src)]).toEqual([]);
  });

  it('accepts an eval-quoted assignment, which the deploy script uses', () => {
    const src = ['eval "SHELF_DOCUMENT_READS_VAL=\\${X:-}"', expansion].join('\n');
    expect([...unsetValueRefs(src)]).toEqual([]);
  });

  // The regression the guard exists for: the value is empty at expansion time.
  it('rejects an assignment that only appears after the expansion', () => {
    const src = [expansion, 'SHELF_DOCUMENT_READS_VAL="true"'].join('\n');
    expect([...unsetValueRefs(src)]).toEqual(['SHELF_DOCUMENT_READS_VAL']);
  });

  it('rejects a commented-out assignment', () => {
    const src = ['# SHELF_DOCUMENT_READS_VAL="true"', expansion].join('\n');
    expect([...unsetValueRefs(src)]).toEqual(['SHELF_DOCUMENT_READS_VAL']);
  });

  // The name inside a string or after a no-op is not an assignment.
  it('rejects an echo or a no-op comment that merely mentions the assignment', () => {
    for (const decoy of ['echo "SHELF_DOCUMENT_READS_VAL=true"', ': # SHELF_DOCUMENT_READS_VAL=true']) {
      expect([...unsetValueRefs([decoy, expansion].join('\n'))]).toEqual(['SHELF_DOCUMENT_READS_VAL']);
    }
  });

  it('accepts an exported assignment', () => {
    const src = ['export SHELF_DOCUMENT_READS_VAL="true"', expansion].join('\n');
    expect([...unsetValueRefs(src)]).toEqual([]);
  });

  it('rejects a name nothing assigns at all', () => {
    expect([...unsetValueRefs(expansion)]).toEqual(['SHELF_DOCUMENT_READS_VAL']);
  });
});
