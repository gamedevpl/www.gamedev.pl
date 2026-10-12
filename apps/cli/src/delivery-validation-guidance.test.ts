import { expect, it } from 'vitest';
import { fixture } from './repl-delivery.fixture.js';
import { submitGame } from './submit.js';
import { formatError } from './errors.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { offerSubmit } from './workshop.js';

function rejectedFixture() {
  const f = fixture();
  f.state.red = false;
  f.state.deliveryFailure = { status: 400, body: { error: 'Missing export fillLandGen', code: 'invalid_upload' } };
  return f;
}

it.each([false, true])('keeps shell retry guidance executable with publish=%s', async (publish) => {
  const f = rejectedFixture();
  const failure = await submitGame({
    api: f.api,
    slug: f.ws.slug,
    dest: f.root,
    publish,
    force: true,
    takeover: true,
    run: f.ws.run,
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(CliError);
  expect((failure as CliError).exitCode).toBe(EXIT_REFUSED);
  const text = formatError(failure);
  expect(text).toContain(`gamedevpl ${publish ? 'publish' : 'push'} --force --takeover in the same checkout`);
  expect(text).not.toContain('retry /');
});

it.each([
  ['/publish', '/publish'],
  ['/push --publish', '/publish'],
  ['/submit --publish', '/publish'],
  ['/publish --force --takeover', '/publish --force --takeover'],
  ['/push', '/push'],
  ['/submit', '/push'],
])('keeps interactive retry guidance in the requested mode for %s', async (command, retry) => {
  const f = rejectedFixture();
  f.ws.unattended = { deliver: true };
  await f.run(command);
  const text = f.lines.join('\n');
  expect(text).toContain(`retry ${retry} in the same checkout`);
  expect(text).not.toContain('retry gamedevpl');
  expect(f.pick).not.toHaveBeenCalled();
  if (command.includes('publish')) expect(text).not.toContain('retry /push');
});

it.each([false, true])(
  'uses the correct retry context for an automatic offer with unattended=%s',
  async (unattended) => {
    const f = rejectedFixture();
    if (unattended) f.ws.unattended = { deliver: true };
    else f.pick.mockResolvedValue('deliver a preview');
    await offerSubmit({ api: f.api, ws: f.ws, write: (line) => f.lines.push(line) });
    expect(f.lines.join('\n')).toContain(`retry ${unattended ? 'gamedevpl push' : '/push'} in the same checkout`);
  },
);
