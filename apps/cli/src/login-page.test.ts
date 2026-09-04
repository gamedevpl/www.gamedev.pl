import { describe, expect, it } from 'vitest';
import { loopbackPage } from './login-page.js';

describe('loopbackPage', () => {
  it('uses consent chrome, not a centered hero', () => {
    const html = loopbackPage('done');
    expect(html).toContain('Signed in');
    expect(html).toContain('<span>gamedev.pl</span>');
    expect(html).toContain('class="lead"');
    expect(html).toContain('--turquoise');
    expect(html).toContain('class="mascot"');
    expect(html).not.toContain('text-align: center');
    expect(html).not.toContain('justify-content: center');
    expect(html).not.toContain('width: 70px');
  });
});
