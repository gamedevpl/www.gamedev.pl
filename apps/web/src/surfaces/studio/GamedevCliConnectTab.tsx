import { useTranslation } from 'react-i18next';
import { useCliSurfaceEnabled } from '../../useCliSurfaceEnabled.js';

export function GamedevCliConnectTab({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const on = useCliSurfaceEnabled();
  if (!on) return null;
  const snippet = `curl -fsSL ${window.location.origin}/install.sh | bash\ngamedev connect ${slug}`;
  return (
    <div className="studio-connect-step" data-testid="gamedev-cli-connect">
      <h4 className="studio-connect-step-title">{t('connect.gamedevCli.title')}</h4>
      <p className="studio-connect-same">{t('connect.gamedevCli.hint')}</p>
      <pre className="studio-connect-snippet" tabIndex={0}>
        {snippet}
      </pre>
    </div>
  );
}
