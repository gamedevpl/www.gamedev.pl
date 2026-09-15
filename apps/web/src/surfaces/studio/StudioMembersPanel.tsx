import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { recordShareStep } from '../../visitTelemetry.js';
import {
  cancelEditorInvite,
  fetchGameEditors,
  inviteGameEditor,
  leaveGameEditors,
  removeGameEditor,
  type EditorInviteApiError,
  type EditorMember,
  type EditorsPayload,
} from '../../editorInviteApi.js';

const REFUSALS: Record<string, string> = {
  invalid_code: 'studioPanel.share.errors.invalidCode',
  cannot_invite_self: 'studioPanel.share.errors.self',
  recipient_ineligible: 'studioPanel.share.errors.ineligible',
  stale_owner: 'studioPanel.share.errors.staleOwner',
  not_owner: 'studioPanel.share.errors.notOwner',
  already_member: 'studioPanel.share.errors.alreadyMember',
  member_cap: 'studioPanel.share.errors.memberCap',
  busy: 'studioPanel.share.errors.alreadyOut',
};

export function StudioMembersPanel({ slug, onLeft }: { slug: string; onLeft?: () => void }): JSX.Element {
  const { t, i18n } = useTranslation();
  const [payload, setPayload] = useState<EditorsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchGameEditors(slug));
    } catch {
      setError(t('studioPanel.share.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function explain(caught: unknown): string {
    const reason = (caught as EditorInviteApiError)?.code;
    return reason && REFUSALS[reason] ? t(REFUSALS[reason]) : t('studioPanel.share.errors.generic');
  }

  async function send(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await inviteGameEditor(slug, trimmed);
      recordShareStep('offered');
      setCode('');
      setPayload(await fetchGameEditors(slug));
    } catch (caught) {
      if ((caught as EditorInviteApiError)?.code === 'busy') {
        setPayload(await fetchGameEditors(slug).catch(() => payload));
        setError(t('studioPanel.share.errors.alreadyOut'));
      } else {
        setError(explain(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(memberKey: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await cancelEditorInvite(slug, memberKey);
      recordShareStep('cancelled');
      setPayload(await fetchGameEditors(slug));
    } catch (caught) {
      if ((caught as EditorInviteApiError)?.code === 'not_found') {
        setPayload(await fetchGameEditors(slug).catch(() => payload));
      } else {
        setError(explain(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: EditorMember): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await removeGameEditor(slug, member.memberKey);
      recordShareStep('removed');
      setPayload(await fetchGameEditors(slug));
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function leave(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await leaveGameEditors(slug);
      recordShareStep('left');
      onLeft?.();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  const owner = payload?.owner;
  const editors = payload?.editors ?? [];
  const pending = (payload?.invites ?? []).filter((invite) => invite.status === 'pending');
  const isOwner = payload?.viewerRole === 'owner';
  const isEditor = payload?.viewerRole === 'editor';

  return (
    <div className="studio-transfer" data-testid="studio-members">
      <p className="studio-rail-credentials-hint">{t('studioPanel.share.intro')}</p>
      {loading ? <p className="studio-connect-state">{t('studioPanel.share.loading')}</p> : null}

      {!loading && owner ? (
        <ul className="studio-transfer-invites" data-testid="studio-members-list">
          <li>
            <p className="studio-transfer-who">
              <PixelIcon name="user" size={14} />
              <span>
                {t('studioPanel.share.owner', { name: owner.profileName })}
                {owner.you ? ` ${t('studioPanel.share.you')}` : ''}
              </span>
            </p>
          </li>
          {editors.map((member) => (
            <li key={member.memberKey} data-testid={`studio-member-${member.memberKey}`}>
              <p className="studio-transfer-who">
                <PixelIcon name="share" size={14} />
                <span>
                  {t('studioPanel.share.editor', { name: member.profileName })}
                  {member.you ? ` ${t('studioPanel.share.you')}` : ''}
                </span>
              </p>
              {isOwner && !member.you ? (
                <button
                  type="button"
                  className="status-delete"
                  disabled={busy}
                  onClick={() => void remove(member)}
                  data-testid={`studio-member-remove-${member.memberKey}`}
                >
                  {t('studioPanel.share.remove')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isOwner
        ? pending.map((invite) => (
            <div
              key={invite.memberKey}
              className="studio-transfer-pending"
              data-testid={`studio-share-pending-${invite.memberKey}`}
            >
              <p className="studio-transfer-who">
                <PixelIcon name="share" size={14} />
                <span>{t('studioPanel.share.pending', { name: invite.counterparty.profileName })}</span>
              </p>
              <p className="studio-transfer-expiry">
                {t('studioPanel.share.expires', {
                  when: formatRelativeTime(Date.parse(invite.expiresAt), i18n.language),
                })}
              </p>
              <button
                type="button"
                className="status-delete"
                disabled={busy}
                onClick={() => void cancel(invite.memberKey)}
                data-testid={`studio-share-cancel-${invite.memberKey}`}
              >
                {busy ? t('studioPanel.share.cancelling') : t('studioPanel.share.cancel')}
              </button>
            </div>
          ))
        : null}

      {isOwner && pending.length === 0 ? (
        <form className="studio-transfer-form" onSubmit={(event) => void send(event)}>
          <label htmlFor="studio-share-code">{t('studioPanel.share.codeLabel')}</label>
          <input
            id="studio-share-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            placeholder={t('studioPanel.share.codePlaceholder')}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            data-testid="studio-share-code"
          />
          <p className="studio-transfer-expiry">{t('studioPanel.share.codeHint')}</p>
          <button type="submit" className="primary-btn" disabled={busy || code.trim().length === 0}>
            {busy ? t('studioPanel.share.sending') : t('studioPanel.share.send')}
          </button>
        </form>
      ) : null}

      {isEditor ? (
        <button
          type="button"
          className="status-delete"
          onClick={() => void leave()}
          disabled={busy}
          data-testid="studio-share-leave"
        >
          {busy ? t('studioPanel.share.leaving') : t('studioPanel.share.leave')}
        </button>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="studio-members-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
