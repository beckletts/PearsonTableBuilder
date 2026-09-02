/**
 * A course plan, read-only.
 *
 * Used for the public link at /cp/<slug> — which is also what an embed on a
 * website renders — and for colleagues a plan is shared with to view. It shows
 * the programme and the guide's advice in full, so someone who has never opened
 * the Options Guide can still follow the reasoning.
 */
import type { CoursePlanConfig, PlanAnalysis } from '../../lib/courseBuilder';
import { ACTION_LABEL, FUNDING_LABEL, glhLabel, STATUS_LABEL } from '../../lib/courseBuilder';
import { statusTone } from './QualificationRow';

interface Props {
  title: string;
  description?: string | null;
  config: CoursePlanConfig;
  analysis: PlanAnalysis;
  /** Shown above the title, e.g. "Shared with you — view only". */
  contextLabel?: string;
}

export default function CoursePlanReadView({
  title, description, config, analysis, contextLabel,
}: Props) {
  const { quals, totalGlh, unknownGlhCount, checks } = analysis;
  // Notes are the author's own, and off the shared page unless they opted in.
  const showNotes = config.shareNotes === true;

  return (
    <article className="cb-read">
      <header className="cb-read__head">
        {contextLabel && <span className="cb-tag cb-tag--watch">{contextLabel}</span>}
        <h1 className="cb-read__title">{title}</h1>
        {description && <p className="cb-read__desc">{description}</p>}
        <div className="cb-row__meta">
          {config.subject && <span className="cb-tag">{config.subject}</span>}
          {config.level && <span className="cb-tag">{config.level}</span>}
          <span className="cb-tag">First teach {config.firstTeachYear}</span>
        </div>
      </header>

      <div className="cb-plan__summary">
        <div className="cb-stat">
          <span className="cb-stat__value">{quals.length}</span>
          <span className="cb-stat__label">{quals.length === 1 ? 'qualification' : 'qualifications'}</span>
        </div>
        <div className="cb-stat">
          <span className="cb-stat__value">{totalGlh}</span>
          <span className="cb-stat__label">
            total GLH{unknownGlhCount > 0 && ` (+${unknownGlhCount} not published)`}
          </span>
        </div>
        <div className="cb-stat">
          <span className="cb-stat__value">{config.firstTeachYear}</span>
          <span className="cb-stat__label">first teach year</span>
        </div>
      </div>

      <section>
        <h2 className="cb-section-title">The programme</h2>
        {quals.length === 0 ? (
          <p className="cb-empty">No qualifications have been added to this plan yet.</p>
        ) : (
          <ul className="cb-read__items">
            {quals.map((q) => {
              const item = config.items.find((i) => i.id === q.id);
              return (
                <li key={q.id} className={`cb-plan__item cb-plan__item--${statusTone(q)}`}>
                  <h3 className="cb-read__item-title">{q.title}</h3>
                  <div className="cb-row__meta">
                    <span className={`cb-tag cb-tag--${statusTone(q)}`}>{STATUS_LABEL[q.status2027]}</span>
                    <span className="cb-tag">{q.family}</span>
                    <span className="cb-tag">{q.level}</span>
                    <span className="cb-tag">{glhLabel(q)}</span>
                    <span className="cb-tag">{FUNDING_LABEL[q.funded2027]}</span>
                    <span className="cb-row__qn">{q.qn}</span>
                  </div>

                  {showNotes && item?.note && (
                    <p className="cb-read__note">{item.note}</p>
                  )}

                  <details className="cb-read__more">
                    <summary>
                      {ACTION_LABEL[q.action]}
                      {q.reformYear !== null && ` — reform lands for first teach ${q.reformYear}`}
                    </summary>
                    <div className="cb-read__more-body">
                      {q.transition.length > 0 && q.action !== 'unconfirmed' ? (
                        <ul className="cb-note__lines">
                          {q.transition.map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                      ) : (
                        <p className="cb-note__lines">
                          {q.action === 'unconfirmed'
                            ? 'The guide has not published a transition route for this qualification yet.'
                            : 'The guide lists no transition information for this qualification — it is one of the routes to move to, rather than one to move away from.'}
                        </p>
                      )}
                      {q.consider.length > 0 && (
                        <>
                          <h4 className="cb-read__more-title">Qualifications to consider</h4>
                          <ul className="cb-note__lines">
                            {q.consider.map((c) => <li key={c}>{c}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {checks.length > 0 && (
        <section>
          <h2 className="cb-section-title">What to check</h2>
          <ul className="cb-checks">
            {checks.map((check, i) => (
              <li key={i} className={`cb-note cb-note--${check.tone}`}>
                <h3 className="cb-note__title">{check.title}</h3>
                <p className="cb-note__detail">{check.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showNotes && config.notes && (
        <section>
          <h2 className="cb-section-title">Planning notes</h2>
          <p className="cb-read__notes">{config.notes}</p>
        </section>
      )}

      <footer className="cb-read__foot">
        <p className="text-sm text-soft">
          Built from the Pearson post-16 Options Guide. Status and funding shown are for first teach{' '}
          {config.firstTeachYear}; speak to your Curriculum Development Manager before committing to a programme.
        </p>
      </footer>
    </article>
  );
}
