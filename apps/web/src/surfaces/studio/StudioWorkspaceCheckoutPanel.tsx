import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { fetchGameWorkspace, type StudioApiError } from '../../studioApi.js';
import { recordStudioStep } from '../../visitTelemetry.js';
import './studio-connect.css';
import './studio-credentials.css';
import './studio-share.css';

type StudioWorkspaceCheckoutPanelProps = {
  slug: string;
};

/**
 * Hands the archive to the browser without navigating away from the studio.
 *
 * The object URL is released on a later task than the click: releasing it in the same
 * task can cancel the download the click just started.
 */
function saveArchive(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * One sentence per failure, in the creator's language.
 *
 * The server's own wording is used for exactly one case: 409 says the first build has
 * not finished yet, which is an ordinary state with an action attached, and the route
 * words it better than a status code can. Every other body carries a machine code or an
 * internal detail, so it never reaches the screen.
 */
function checkoutErrorText(error: StudioApiError, t: TFunction): string {
  switch (error.status) {
    case 401:
      return t('workspaceCheckout.errors.signedOut');
    case 404:
      return t('workspaceCheckout.errors.notFound');
    case 409:
      return error.message === 'nothing_delivered' && error.detail
        ? error.detail
        : t('workspaceCheckout.errors.notDelivered');
    case 503:
      return t('workspaceCheckout.errors.unavailable');
    default:
      return t('workspaceCheckout.errors.failed');
  }
}

/**
 * Checkout of a working copy, for creators who would rather use their own IDE and their
 * own repo than the Studio's agent flow (CO-05).
 *
 * A panel of its own rather than a button in the overview actions, and placed with the
 * agent-key panels at the foot of Details: this is the "bring your own agent" corner of
 * the studio, it needs a line of explanation the action row has no space for, and a
 * creator who wants their own IDE is already down here fetching a key. It is deliberately
 * nowhere near the create flow — that path never has to mention it.
 *
 * A checkout is not a handover. The game's home, and the only way to publish it, is still
 * here, which is why the copy talks about delivering back rather than about what the
 * creator now holds.
 */
export function StudioWorkspaceCheckoutPanel({ slug }: StudioWorkspaceCheckoutPanelProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);

  async function handleCheckout() {
    setPending(true);
    setError(null);
    setDelivered(false);
    try {
      const archive = await fetchGameWorkspace(slug);
      saveArchive(archive.blob, archive.filename);
      // Recorded on success only, and always as `self`: a creator taking a working copy
      // is choosing to build it themselves, whoever built the last round.
      recordStudioStep('workspace_checkout', 'self');
      setDelivered(true);
    } catch (err) {
      setError(checkoutErrorText(err as StudioApiError, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="studio-agent-key" aria-labelledby={`${baseId}-title`} data-testid="workspace-checkout">
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('workspaceCheckout.title')}
      </h3>
      <p className="studio-share-hint">{t('workspaceCheckout.hint')}</p>

      <div className="studio-connect-actions">
        <button
          type="button"
          className="studio-connect-skip"
          disabled={pending}
          onClick={() => void handleCheckout()}
          data-testid="workspace-checkout-start"
        >
          <PixelIcon name="folder" size={12} />{' '}
          {pending ? t('workspaceCheckout.pending') : t('workspaceCheckout.action')}
        </button>
      </div>

      {/* A download leaves no trace in the page, and on a desktop it can land in a
          folder the creator never looks at — so say it happened. */}
      {delivered && !error ? (
        <p className="studio-connect-state" aria-live="polite" data-testid="workspace-checkout-done">
          {t('workspaceCheckout.done')}
        </p>
      ) : null}
      {error ? (
        <p className="error" data-testid="workspace-checkout-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
