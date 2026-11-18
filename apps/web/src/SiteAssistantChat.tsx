import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPageAgent, nano, remote, withFallback } from 'genaicode/browser';
import { PageAgentChat } from 'genaicode/react';
import 'genaicode/react/styles.css';
import { fetchCatalog, type CatalogEntry } from './catalog.js';
import { NAVIGATE_EVENT } from './core/router.js';
import { createSiteAssistantTools } from './siteAssistantTools.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

const NANO_INSTRUCTIONS =
  'You are the mascot of gamedev.pl, a site where people play browser games and make their own with AI. ' +
  'Help the visitor find a game with search_games. Answer in two or three short sentences.';

// Pushes like the app does, then tells the app's router.
function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path } }));
}

async function semanticSlug(query: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`${API_BASE}/api/catalog/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as { match?: { slug?: string } | null; score?: number };
  return data.match?.slug && typeof data.score === 'number' && data.score >= 0.55 ? data.match.slug : null;
}

export function SiteAssistantChat() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pl') ? 'pl' : 'en';

  const assistant = useMemo(() => {
    let catalog: Promise<CatalogEntry[]> | undefined;
    const tools = createSiteAssistantTools({
      // One catalog read per chat; a failed read is tried again.
      loadCatalog: () => (catalog ??= fetchCatalog().catch((error) => ((catalog = undefined), Promise.reject(error)))),
      navigate,
      semanticSlug,
      locale,
    });
    return createPageAgent({
      name: 'gamedev.pl',
      tools,
      // The server model first; the browser's own when it rests.
      agent: withFallback([
        remote({ url: `${API_BASE}/api/assistant`, name: 'gamedev.pl', tools, sendTools: false, maxToolOutput: 2000 }),
        nano({ name: 'gamedev.pl', tools, instructions: NANO_INSTRUCTIONS }),
      ]),
    });
  }, [locale]);

  useEffect(() => () => assistant.stop(), [assistant]);

  return (
    <PageAgentChat
      agent={assistant}
      theme="dark"
      autoFocus
      hint={null}
      className="site-assistant-chat"
      placeholder={t('siteAssistant.placeholder')}
      emptyState={<p className="site-assistant-empty">{t('siteAssistant.empty')}</p>}
      unavailable={<p className="site-assistant-empty">{t('siteAssistant.resting')}</p>}
    />
  );
}
