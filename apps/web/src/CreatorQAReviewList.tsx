import { useTranslation } from 'react-i18next';
import type { BuilderKind } from './builderKind.js';
import type { QAQuestion } from './CreatorQA.js';

interface CreatorQAReviewListProps {
  title: string;
  submitting: boolean;
  questions: QAQuestion[];
  builder: BuilderKind;
  reviewIndex: number;
  answerFor: (id: string) => string;
  goTo: (index: number) => void;
}

export function CreatorQAReviewList({
  title,
  submitting,
  questions,
  builder,
  reviewIndex,
  answerFor,
  goTo,
}: CreatorQAReviewListProps) {
  const { t } = useTranslation();

  return (
    <dl className={`qa-review${submitting ? ' is-submitting' : ''}`}>
      <div className="qa-review-row">
        <dt className="qa-review-label">{t('qa.nameLabel')}</dt>
        <dd className="qa-review-value">
          <span>{title.trim()}</span>
          <button
            type="button"
            className="qa-review-edit"
            disabled={submitting}
            onClick={() => goTo(0)}
            aria-label={`${t('qa.edit')}: ${t('qa.nameLabel')}`}
          >
            {t('qa.edit')}
          </button>
        </dd>
      </div>

      {questions.map((q, index) => {
        const answer = answerFor(q.id);
        return (
          <div className="qa-review-row" key={q.id}>
            <dt className="qa-review-label">{q.question}</dt>
            <dd className="qa-review-value">
              <span className={answer ? undefined : 'qa-review-unset'}>{answer || t('qa.aiDecides')}</span>
              <button
                type="button"
                className="qa-review-edit"
                disabled={submitting}
                onClick={() => goTo(index + 1)}
                aria-label={`${t('qa.edit')}: ${q.question}`}
              >
                {t('qa.edit')}
              </button>
            </dd>
          </div>
        );
      })}

      <div className="qa-review-row">
        <dt className="qa-review-label">{t('builder.legend')}</dt>
        <dd className="qa-review-value">
          <span>{t(builder === 'self' ? 'builder.self.title' : 'builder.platform.title')}</span>
          <button
            type="button"
            className="qa-review-edit"
            disabled={submitting}
            onClick={() => goTo(reviewIndex - 1)}
            aria-label={`${t('qa.edit')}: ${t('builder.legend')}`}
          >
            {t('qa.edit')}
          </button>
        </dd>
      </div>
    </dl>
  );
}
