import { LOCALES, type Locale } from '@gamedevpl/contract';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = LOCALES;
export type SupportedLanguage = Locale;

const STORAGE_KEY = 'gamedevpl:lang';

/**
 * Mirrors what i18next-browser-languagedetector's `order: ['localStorage', 'navigator']`
 * already resolved to: a cached choice, then the browser's own language list, then 'en'.
 * Done by hand rather than through that plugin because a *detector* only decides which
 * language is active — loading it is still i18next's own job, and i18next always loads
 * `fallbackLng`'s resources too whenever the active language differs from it, which is
 * exactly the "ship the other locale anyway" bug this file exists to fix. Resolving the
 * language ourselves lets `resources` below name only the one JSON that's actually needed.
 */
function detectLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) return stored as SupportedLanguage;
  } catch {
    // localStorage unavailable (private mode, disabled) — fall through to navigator.
  }
  const candidates = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const candidate of candidates) {
    const base = candidate?.split(/[-_]/)[0]?.toLowerCase();
    if (base && (SUPPORTED_LANGUAGES as readonly string[]).includes(base)) return base as SupportedLanguage;
  }
  return 'en';
}

/** The one network request this whole module exists to avoid doubling. */
async function loadLocale(language: SupportedLanguage): Promise<Record<string, unknown>> {
  const module: { default: Record<string, unknown> } = await import(`./locales/${language}.json`);
  return module.default;
}

/**
 * Resolves once the active locale — and only the active locale — is loaded into i18next.
 * `main.tsx` awaits this before its first render, the same synchronous-relative-to-render
 * guarantee the old both-locales-bundled version gave for free; the difference is this one
 * pays for a small fetch of the locale actually in use, not the unused one's bytes baked
 * into every visitor's main bundle.
 */
export const i18nReady: Promise<void> = (async () => {
  const language = detectLanguage();
  let resource: Record<string, unknown> | undefined;
  try {
    resource = await loadLocale(language);
  } catch {
    // Offline with no cached copy of the locale chunk — an installed PWA reopened after
    // its HTTP cache evicted the entry, since sw.js serves deferred locale chunks
    // network-only by design (see shellPrecache.ts). main.tsx clears the boot watchdog
    // before awaiting this promise, so rejecting here would leave the page permanently
    // blank instead of rendering. i18next still gets initialized below, just without a
    // resource bundle for `language` — react-i18next falls back to raw keys, and because
    // hasResourceBundle(language) is now false, the changeLanguage wrapper installed
    // below treats a later switch back to this same language as a genuine retry (e.g.
    // the language switcher itself, once connectivity returns) instead of a permanent
    // dead end that only a full reload could recover from.
  }
  await i18n.use(initReactI18next).init({
    lng: language,
    resources: resource ? { [language]: { translation: resource } } : {},
    // No fallbackLng: with it, i18next preloads that language's resources too on every
    // init and every changeLanguage — for a Polish visitor that means downloading English
    // anyway, undoing the split for anyone but English visitors. en/pl are kept at 100% key
    // parity by locales.test.ts, so a key missing in the active locale never happens in a
    // shipped build; the raw key rendering instead of a silent cross-locale fallback is an
    // acceptable trade for that guarantee never being exercised in practice.
    fallbackLng: false,
    supportedLngs: SUPPORTED_LANGUAGES,
    // Only the language subtag matters (e.g. 'pl-PL' -> 'pl'); avoids missing
    // resources for locale variants we don't ship separately.
    load: 'languageOnly',
    interpolation: { escapeValue: false },
  });

  // Installed only now, after init() above has finished — init() triggers its own
  // internal changeLanguage() call to set the initial language, and wrapping it any
  // earlier makes that call await this very promise before it can resolve, deadlocking
  // every caller of i18nReady, this function included.
  //
  // Wraps i18next's own `changeLanguage` so every existing call site — LanguageSwitcher.tsx,
  // and the 70+ tests that call `i18n.changeLanguage(...)` directly — keeps working
  // unchanged: it fetches the target locale's JSON first if it isn't already loaded, then
  // delegates. Nothing outside this module can observe `i18n.changeLanguage` before this
  // point: production code awaits `i18nReady` in main.tsx before rendering anything that
  // could call it, and every test does the same via `i18nTestSetup.ts`.
  const nativeChangeLanguage = i18n.changeLanguage.bind(i18n);
  // Tracks which call is the most recent, so a slow first load (e.g. clicking PL then EN
  // while PL's chunk is still fetching) can't resolve after the fast second call already
  // applied and silently switch the UI back — only the latest click may ever take effect.
  let latestChangeLanguageSeq = 0;
  let latestChangeLanguagePromise: ReturnType<typeof nativeChangeLanguage> | undefined;
  i18n.changeLanguage = (async (lng?: string, callback?: (error: unknown, t: unknown) => void) => {
    const seq = ++latestChangeLanguageSeq;
    const run = (async () => {
      if (lng && (SUPPORTED_LANGUAGES as readonly string[]).includes(lng)) {
        if (!i18n.hasResourceBundle(lng, 'translation')) {
          const resourceForLng = await loadLocale(lng as SupportedLanguage);
          if (seq !== latestChangeLanguageSeq) {
            // A newer switch started while this fetch was in flight — defer to it
            // instead of applying a now-stale result on top of it. Non-null: `seq`
            // only differs from the counter once a later call has already run past
            // its own assignment below, so the promise it set is always present.
            return latestChangeLanguagePromise!;
          }
          i18n.addResourceBundle(lng, 'translation', resourceForLng, true, true);
        }
        // Persisted on every successful switch, not only the first time a bundle
        // loads — otherwise switching back to an already-loaded language (EN -> PL
        // -> EN) never updates the stored choice, and the next reload reverts to PL.
        try {
          localStorage.setItem(STORAGE_KEY, lng);
        } catch {
          // best-effort persistence only
        }
      }
      return nativeChangeLanguage(lng, callback);
    })();
    latestChangeLanguagePromise = run;
    return run;
  }) as typeof i18n.changeLanguage;
})();

export default i18n;
