import { describe, expect, it } from 'vitest';
import { buildSpecStub } from './spec-stub.js';

describe('buildSpecStub', () => {
  it('keeps the creator QA answers below the brief', () => {
    const stub = buildSpecStub({
      title: 'Sky Dodge',
      slug: 'sky-dodge',
      spec: 'Dodge falling rocks.',
      qa: ['Controls: arrow keys', ' ', 'Art style: pixel art'],
    });
    expect(stub).toContain(
      'Dodge falling rocks.\n\n## Creator clarifications\n\n- Controls: arrow keys\n- Art style: pixel art\n',
    );
  });

  it('omits the clarifications section when nothing was answered', () => {
    const stub = buildSpecStub({ title: 'Sky Dodge', slug: 'sky-dodge', spec: 'Dodge falling rocks.', qa: [] });
    expect(stub).not.toContain('Creator clarifications');
  });

  it('escapes quotes in the frontmatter title', () => {
    expect(buildSpecStub({ title: 'Say "hi"', slug: 'say-hi' })).toContain('title: "Say \\"hi\\""');
  });
});
