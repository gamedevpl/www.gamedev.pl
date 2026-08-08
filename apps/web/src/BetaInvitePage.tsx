import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { recordBetaInviteStep } from './visitTelemetry.js';

type InviteState = 'claiming' | 'accepted' | 'unavailable';

export function BetaInvitePage({ code, onContinue }: { code: string; onContinue: () => void }) {
  const { t } = useTranslation();
  const { acceptBetaInvite } = useAuth();
  const [state, setState] = useState<InviteState>('claiming');

  useEffect(() => {
    let cancelled = false;
    void acceptBetaInvite(code)
      .then(() => {
        if (cancelled) return;
        recordBetaInviteStep('accepted');
        setState('accepted');
      })
      .catch(() => {
        if (cancelled) return;
        recordBetaInviteStep('unavailable');
        setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [acceptBetaInvite, code]);

  return (
    <div className="beta-invite">
      <div className="beta-invite__card">
        <div className="beta-splash__logo">
          <span className="beta-splash__logo-main">gamedev</span>
          <span className="beta-splash__logo-tld">.pl</span>
        </div>
        {state === 'claiming' && (
          <>
            <h1>{t('betaInvite.claiming')}</h1>
            <p>{t('betaInvite.claimingSub')}</p>
          </>
        )}
        {state === 'accepted' && (
          <>
            <h1>{t('betaInvite.accepted')}</h1>
            <p>{t('betaInvite.acceptedSub')}</p>
            <button type="button" className="beta-splash__waitlist-btn" onClick={onContinue}>
              {t('betaInvite.continue')}
            </button>
          </>
        )}
        {state === 'unavailable' && (
          <>
            <h1>{t('betaInvite.unavailable')}</h1>
            <p>{t('betaInvite.unavailableSub')}</p>
            <button type="button" className="beta-splash__waitlist-btn" onClick={onContinue}>
              {t('betaInvite.backHome')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
