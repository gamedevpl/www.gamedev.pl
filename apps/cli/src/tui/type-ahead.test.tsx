import { expect, it } from 'vitest';
import { screen } from './workspace-fixture.js';

it('shows text typed during startup and history restore, then opens the first prompt with it', async () => {
  const view = screen(80, 24);
  view.session.setActivity('Connecting to Studio');
  await view.press('napraw');
  expect(view.frame()).toContain('Next message');
  expect(view.frame()).toContain('napraw');
  view.session.restoreHistory({ lines: ['› stara prośba'], prompts: ['stara prośba'] });
  view.session.setActivity('Checking Creator Kit updates');
  await view.press(' skok');
  expect(view.frame()).toContain('napraw skok');
  const kit = view.session.prompt(['Update Creator Kit now', 'Later'], 'Update the game tools?');
  expect(view.frame()).not.toContain('Next message');
  view.session.movePick(1);
  view.session.submit();
  expect(await kit).toBe('Later');
  expect(view.frame()).toContain('napraw skok');
  await view.press('\r');
  await view.press('!');
  expect(view.session.get().draft).toBe('napraw skok!');
  const first = view.session.prompt();
  expect(view.session.get()).toMatchObject({ mode: 'prompt', draft: 'napraw skok!', draftCursor: 12 });
  expect(view.frame()).toContain('napraw skok!');
  await view.press('\r');
  expect(await first).toBe('napraw skok!');
});

it('keeps a terminal draft parked by a browser answer and appends type-ahead to it', async () => {
  const view = screen(80, 24);
  const first = view.session.prompt();
  await view.press('half');
  expect(view.session.acceptInput('from browser', view.session.get().promptId)).toBe(true);
  expect(await first).toBe('from browser');
  expect(view.frame()).toContain('Next message');
  await view.press(' done');
  void view.session.prompt();
  expect(view.session.get()).toMatchObject({ mode: 'prompt', draft: 'half done' });
});
