import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import {
  clearInstallPrompt,
  dismissInstall,
  installDismissedAt,
  isIosInstallCandidate,
  isStandalone,
  pendingInstallPrompt,
  shouldOfferInstall,
  subscribeInstallPrompt,
  visitCount,
  type BeforeInstallPromptEvent,
} from './pwa.js';

/**
 * The offer to install the app (docs/mobile-app-plan.md M1).
 *
 * Two platforms, two entirely different mechanics. Chrome hands over a real
 * `beforeinstallprompt` event that opens the OS install dialog; iOS has no such API and
 * never will, so the only honest thing to do there is describe the Share-sheet route and
 * let the reader do it. The eligibility rules — repeat visitor, not already installed,
 * dismissal remembered — are shared, and live in [pwa.ts](./pwa.ts) with their reasoning.
 *
 * Mounted only inside the signed-in app, which is what keeps it away from the two
 * audiences it would be wrong for: a controller guest mid-party, and an anonymous
 * visitor still looking at the closed-beta splash.
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const eligible = shouldOfferInstall({
      visits: visitCount(),
      dismissedAt: installDismissedAt(),
      now: Date.now(),
      standalone: isStandalone(),
    });
    if (!eligible) return;

    if (isIosInstallCandidate(navigator.userAgent, navigator.maxTouchPoints)) {
      setShowIosHint(true);
      return;
    }

    // Whatever `main.tsx` already caught, plus anything Chrome offers later — it can
    // withhold the event on this load and produce it on the next one.
    setPrompt(pendingInstallPrompt());
    return subscribeInstallPrompt(setPrompt);
  }, []);

  if (closed) return null;
  if (!showIosHint && !prompt) return null;

  function close() {
    setClosed(true);
    dismissInstall();
  }

  async function install() {
    if (!prompt) return;
    // One `prompt()` per event, whatever the answer — so the offer is spent either way
    // and the banner goes regardless of what they choose.
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    clearInstallPrompt();
    setClosed(true);
    // Saying no here is a dismissal and should hold for the same month. Saying yes needs
    // no record: the app is installed, and `isStandalone()` will answer for it forever.
    if (outcome === 'dismissed') dismissInstall();
  }

  return (
    <aside className="install-prompt" role="complementary" aria-label={t('pwa.ariaLabel')}>
      <PixelIcon name="phone" size={20} className="install-prompt__icon" />

      <div className="install-prompt__copy">
        <p className="install-prompt__title">{t('pwa.installTitle')}</p>
        {showIosHint ? (
          <ol className="install-prompt__steps">
            <li>
              {t('pwa.iosStepShare')} <PixelIcon name="share" size={12} />
            </li>
            <li>{t('pwa.iosStepAdd')}</li>
          </ol>
        ) : (
          <p className="install-prompt__body">{t('pwa.installBody')}</p>
        )}
      </div>

      <div className="install-prompt__actions">
        {!showIosHint && (
          <button type="button" className="primary-btn install-prompt__install" onClick={() => void install()}>
            {t('pwa.installAction')}
          </button>
        )}
        <button
          type="button"
          className="install-prompt__close"
          onClick={close}
          aria-label={t('pwa.dismiss')}
          title={t('pwa.dismiss')}
        >
          <PixelIcon name="close" size={12} />
        </button>
      </div>
    </aside>
  );
}
