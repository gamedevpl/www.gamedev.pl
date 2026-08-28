import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProposalDiff, type ProposalDiff } from '../../proposalsApi.js';

/**
 * What a proposal changes, for the reviewer who wants to look.
 *
 * Everything here is rendered as text. This is the first surface on the site where a
 * stranger's *code* is put in front of a person, and the posture is that nothing in it is
 * interpreted — no markdown, no links, no HTML. React escapes by default, which is most of
 * the job; the rest is not undoing that for the sake of syntax highlighting.
 *
 * The server bounds the diff and says what it dropped. That is surfaced rather than
 * swallowed: a review that quietly showed part of a change would read as complete, and a
 * reviewer would approve what they never saw.
 */
export function ProposalDiffView(props: { proposalId: string }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<ProposalDiff | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProposalDiff(props.proposalId)
      .then((value) => {
        if (!cancelled) setDiff(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.proposalId]);

  if (failed) return <p className="proposal-sub">{t('reviews.diffUnavailable')}</p>;
  if (!diff) return null;
  if (diff.files.length === 0) return <p className="proposal-sub">{t('reviews.diffEmpty')}</p>;

  return (
    <section className="proposal-diff" aria-label={t('reviews.viewChanges')}>
      <p className="proposal-sub">
        {t('reviews.diffSummary', {
          files: diff.files.length,
          additions: diff.additions,
          deletions: diff.deletions,
        })}
      </p>

      {diff.files.map((file) => (
        <article key={file.path} className="proposal-diff-file">
          <header>
            <code>{file.path}</code>
            <span className="proposal-diff-counts">
              <span className="is-add">+{file.additions}</span> <span className="is-del">−{file.deletions}</span>
            </span>
          </header>
          {/* Its own scroll container: a long line in somebody else's code must never make
              the page itself scroll sideways. */}
          <div className="proposal-diff-body">
            <table>
              <tbody>
                {file.lines.map((line, index) => (
                  <tr
                    key={`${file.path}:${index}`}
                    className={line.kind === 'add' ? 'is-add' : line.kind === 'del' ? 'is-del' : undefined}
                  >
                    <td className="proposal-diff-ln">{line.a ?? ''}</td>
                    <td className="proposal-diff-ln">{line.b ?? ''}</td>
                    <td>{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</td>
                    <td className="proposal-diff-text">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {file.truncated ? <p className="proposal-sub">{t('reviews.diffTruncated')}</p> : null}
        </article>
      ))}

      {diff.omittedFiles > 0 ? (
        <p className="proposal-sub">{t('reviews.diffOmitted', { count: diff.omittedFiles })}</p>
      ) : null}
    </section>
  );
}
