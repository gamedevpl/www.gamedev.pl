import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function GamedevCliConnectTab({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void fetch('/api/cli/enabled')
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
        setOn(res.ok && body?.enabled === true);
      })
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const snippet = `curl -fsSL https://www.gamedev.pl/install.sh | bash\ngamedev connect ${slug}`;
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
