import { beforeEach } from 'vitest';
import { i18nReady } from './i18n/index.js';

// i18n/index.ts now loads the active locale's JSON via a real dynamic import() instead of
// a synchronously-available static one, so a test that renders a translated component
// without itself calling i18n.changeLanguage() first could race the initial load. Every
// test file already gets this via Vitest's setupFiles, so no test needs to know about it.
beforeEach(async () => {
  await i18nReady;
});
