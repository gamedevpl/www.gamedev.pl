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
  invalid_code: 'studioPanel.members.errors.invalidCode',
  cannot_invite_self: 'studioPanel.members.errors.self',
  recipient_ineligible: 'studioPanel.members.errors.ineligible',
  stale_owner: 'studioPanel.members.errors.staleOwner',
  not_owner: 'studioPanel.members.errors.notOwner',
  already_member: 'studioPanel.members.errors.alreadyMember',
  member_cap: 'studioPanel.members.errors.memberCap',
  busy: 'studioPanel.members.errors.alreadyOut',
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
      setError(t('studioPanel.members.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function explain(caught: unknown): string {
    const reason = (caught as EditorInviteApiError)?.code;
    return reason && REFUSALS[reason] ? t(REFUSALS[reason]) : t('studioPanel.members.errors.generic');
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
        setError(t('studioPanel.members.errors.alreadyOut'));
      } else {
        setError(explain(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(inviteId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await cancelEditorInvite(slug, inviteId);
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
      <p className="studio-rail-credentials-hint">{t('studioPanel.members.intro')}</p>
      {loading ? <p className="studio-connect-state">{t('studioPanel.members.loading')}</p> : null}

      {!loading && owner ? (
        <ul className="studio-transfer-invites" data-testid="studio-members-list">
          <li>
            <p className="studio-transfer-who">
              <PixelIcon name="user" size={14} />
              <span>
                {t('studioPanel.members.owner', { name: owner.profileName })}
                {owner.you ? ` ${t('studioPanel.members.you')}` : ''}
              </span>
            </p>
          </li>
          {editors.map((member) => (
            <li key={member.memberKey} data-testid={`studio-member-${member.memberKey}`}>
              <p className="studio-transfer-who">
                <PixelIcon name="share" size={14} />
                <span>
                  {t('studioPanel.members.editor', { name: member.profileName })}
                  {member.you ? ` ${t('studioPanel.members.you')}` : ''}
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
                  {t('studioPanel.members.remove')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isOwner
        ? pending.map((invite) => (
            <div
              key={invite.inviteId}
              className="studio-transfer-pending"
              data-testid={`studio-share-pending-${invite.memberKey}`}
            >
              <p className="studio-transfer-who">
                <PixelIcon name="share" size={14} />
                <span>{t('studioPanel.members.pending', { name: invite.counterparty.profileName })}</span>
              </p>
              <p className="studio-transfer-expiry">
                {t('studioPanel.members.expires', {
                  when: formatRelativeTime(Date.parse(invite.expiresAt), i18n.language),
                })}
              </p>
              <button
                type="button"
                className="status-delete"
                disabled={busy}
                onClick={() => void cancel(invite.inviteId)}
                data-testid={`studio-share-cancel-${invite.memberKey}`}
              >
                {busy ? t('studioPanel.members.cancelling') : t('studioPanel.members.cancel')}
              </button>
            </div>
          ))
        : null}

      {isOwner ? (
        <form className="studio-transfer-form" onSubmit={(event) => void send(event)}>
          <label htmlFor="studio-share-code">{t('studioPanel.members.codeLabel')}</label>
          <input
            id="studio-share-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            placeholder={t('studioPanel.members.codePlaceholder')}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            data-testid="studio-share-code"
          />
          <p className="studio-transfer-expiry">{t('studioPanel.members.codeHint')}</p>
          <button type="submit" className="primary-btn" disabled={busy || code.trim().length === 0}>
            {busy ? t('studioPanel.members.sending') : t('studioPanel.members.send')}
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
          {busy ? t('studioPanel.members.leaving') : t('studioPanel.members.leave')}
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
