import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import { ThreadContextBar } from './ThreadContextBar.js';
import { presenceThought } from './presenceThought.js';

it.each(['managed_idle', 'managed_ended'])(
  'keeps %s in the passive footer after the activity timer expires',
  async (key) => {
    await i18n.changeLanguage('en');
    const at = new Date(Date.now() - 120_000).toISOString();
    const thought = presenceThought({ status: 'building', lastAgentPresence: { key, at } });
    const html = renderToStaticMarkup(<ThreadContextBar phase="Starting agent" thought={thought} heartbeatAt={null} />);
    expect(html).toContain(i18n.t(`statusView.presence.${key}`));
    expect(html).not.toContain('Starting agent');
  },
);
