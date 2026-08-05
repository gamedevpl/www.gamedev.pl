import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assignTaskToAgent,
  fetchGameBoard,
  type BoardOpenTask,
  type BoardWorkItem,
  type GameBoard as GameBoardData,
} from './gameBoardApi.js';
import { PixelIcon } from './PixelIcon.js';

/**
 * The task board — four columns, and nothing else.
 *
 * No epics, estimates, sprints or custom fields: each of those pulls the board
 * toward a project tracker, and a tracker is what a hobbyist closes after half a
 * minute (ops `docs/game-page-plan.md`). The columns are a projection of work that
 * already exists — the job state machine — rather than a second place work is
 * recorded.
 *
 * Handing a task to the agent is the only automation here, it is the owner's to
 * press, and it goes through the suggestion inbox's approval endpoint so the quota
 * and the attribution stay where they already live.
 */

type LoadState = 'loading' | 'ready' | 'error';

export function GameBoard({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [board, setBoard] = useState<GameBoardData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setState('loading');
    void fetchGameBoard(slug)
      .then((loaded) => {
        if (cancelled) return;
        setBoard(loaded);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => load(), [load]);

  const assign = useCallback(
    async (id: string) => {
      setAssigning(id);
      setAssignError(null);
      try {
        await assignTaskToAgent(id);
        // Re-read rather than patch: the task leaves the open column and a new job
        // appears in Building, and the server is the one that knows both.
        load();
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'unknown';
        setAssignError(code);
      } finally {
        setAssigning(null);
      }
    },
    [load],
  );

  if (state === 'loading') return <p className="game-page-status">{t('gamePage.board.loading')}</p>;
  if (state === 'error' || !board) {
    return <p className="game-page-status game-page-error">{t('gamePage.board.error')}</p>;
  }

  return (
    <section className="game-board" aria-label={t('gamePage.tabs.board')}>
      {assignError ? (
        <p className="game-board-error" role="alert">
          {t(`gamePage.board.assignError.${assignError}`, { defaultValue: t('gamePage.board.assignError.unknown') })}
        </p>
      ) : null}

      <div className="game-board-columns">
        <BoardColumn title={t('gamePage.board.columns.open')} count={board.open.length}>
          {board.openVisibility === 'private' ? (
            <p className="game-board-empty">{t('gamePage.board.openPrivate')}</p>
          ) : board.open.length === 0 ? (
            <p className="game-board-empty">{t('gamePage.board.openEmpty')}</p>
          ) : (
            board.open.map((task) => (
              <OpenTaskCard
                key={task.id}
                task={task}
                busy={assigning === task.id}
                onAssign={() => void assign(task.id)}
              />
            ))
          )}
        </BoardColumn>

        <BoardColumn title={t('gamePage.board.columns.building')} count={board.building.length}>
          {board.building.length === 0 ? (
            <p className="game-board-empty">{t('gamePage.board.buildingEmpty')}</p>
          ) : (
            board.building.map((item, index) => (
              <WorkCard key={item.jobId ?? index} item={item} language={i18n.language} />
            ))
          )}
        </BoardColumn>

        <BoardColumn title={t('gamePage.board.columns.review')} count={board.review.length}>
          {board.review.length === 0 ? (
            <p className="game-board-empty">{t('gamePage.board.reviewEmpty')}</p>
          ) : (
            board.review.map((item, index) => (
              <WorkCard key={item.jobId ?? index} item={item} language={i18n.language} />
            ))
          )}
        </BoardColumn>

        <BoardColumn title={t('gamePage.board.columns.released')} count={board.released.length}>
          {board.released.length === 0 ? (
            <p className="game-board-empty">{t('gamePage.board.releasedEmpty')}</p>
          ) : (
            board.released.map((item, index) => (
              <WorkCard key={item.jobId ?? index} item={item} language={i18n.language} />
            ))
          )}
        </BoardColumn>
      </div>

      <p className="game-board-note">{t('gamePage.board.note')}</p>
    </section>
  );
}

function BoardColumn({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="game-board-column">
      <h3 className="game-board-column-heading">
        {title} <span className="game-board-column-count">{count}</span>
      </h3>
      <div className="game-board-cards">{children}</div>
    </section>
  );
}

function OpenTaskCard({ task, busy, onAssign }: { task: BoardOpenTask; busy: boolean; onAssign: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="game-board-card">
      <p className="game-board-card-title">{task.findings[0] ?? t('gamePage.board.taskFallback')}</p>
      {task.findings.slice(1).map((finding) => (
        <p key={finding} className="game-board-card-detail">
          {finding}
        </p>
      ))}
      <div className="game-board-card-foot">
        <span className={`game-board-class game-board-class--${task.taskClass}`}>
          {t(`gamePage.board.class.${task.taskClass}`, { defaultValue: task.taskClass })}
        </span>
        <button type="button" className="secondary-btn game-board-assign" onClick={onAssign} disabled={busy}>
          <PixelIcon name="bolt" size={12} /> {busy ? t('gamePage.board.assigning') : t('gamePage.board.assign')}
        </button>
      </div>
    </article>
  );
}

function WorkCard({ item, language }: { item: BoardWorkItem; language: string }) {
  const { t } = useTranslation();
  return (
    <article className="game-board-card">
      <p className="game-board-card-title">{item.title}</p>
      <div className="game-board-card-foot">
        <span className="game-board-card-by">
          {item.agentOpened ? t('gamePage.board.byAgent') : t('gamePage.board.byCreator')}
        </span>
        <span className="game-board-card-when">{formatWhen(item.since, language)}</span>
      </div>
    </article>
  );
}

function formatWhen(iso: string, language: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(parsed);
  } catch {
    return iso.slice(0, 10);
  }
}
