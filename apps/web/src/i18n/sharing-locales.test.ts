import { expect, it } from 'vitest';
import en from './locales/en.json';
import pl from './locales/pl.json';

it.each([
  ['en', en],
  ['pl', pl],
])('%s keeps public sharing and editor membership copy separate', (_, resource) => {
  for (const key of ['share.title', 'share.hintOff', 'share.liveTitle', 'members.intro', 'members.send']) {
    expect(resource).toHaveProperty(`studioPanel.${key}`, expect.any(String));
  }
});
