/**
 * The full Options Guide entry for one qualification: what it is, where it
 * stands for 2027, what the guide says to do, and what to consider instead.
 */
import { useEffect } from 'react';
import type { Qualification } from '../../data/optionsGuide';
import { ACTION_LABEL, FUNDING_LABEL, STATUS_LABEL } from '../../lib/courseBuilder';
import { statusTone } from './QualificationRow';

interface Props {
  qual: Qualification;
  onClose: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  inPlan: boolean;
  /** Search the guide for a suggested replacement. */
  onSearchFor?: (title: string) => void;
}

export default function QualificationDetail({
  qual, onClose, onAdd, onRemove, inPlan, onSearchFor,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tone = statusTone(qual);

  return (
    <div
      className="cb-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cb-modal" role="dialog" aria-modal="true" aria-labelledby="cb-detail-title">
        <div className="cb-modal__header">
          <div>
            <span className={`cb-tag cb-tag--${tone}`}>{STATUS_LABEL[qual.status2027]}</span>
            <h2 className="cb-modal__title" id="cb-detail-title">{qual.title}</h2>
            <p className="cb-modal__sub">{qual.subject} · {qual.qn}</p>
          </div>
          <button type="button" className="cb-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cb-modal__body">
          <dl className="cb-facts">
            <div><dt>Level</dt><dd>{qual.level}</dd></div>
            <div><dt>Type</dt><dd>{qual.family}</dd></div>
            <div><dt>Guided learning hours</dt><dd>{qual.glhValue === null ? 'To be published' : `${qual.glh} GLH`}</dd></div>
            <div><dt>Programme role</dt><dd>{qual.programmeRole}</dd></div>
            <div><dt>Learner profile</dt><dd>{qual.learnerProfile}</dd></div>
            <div><dt>Funding for 2027</dt><dd>{FUNDING_LABEL[qual.funded2027]}</dd></div>
          </dl>

          <section className={`cb-note cb-note--${tone === 'ok' ? 'ok' : tone}`}>
            <h3 className="cb-note__title">
              {ACTION_LABEL[qual.action]}
              {qual.reformYear !== null && ` — reform lands for first teach ${qual.reformYear}`}
            </h3>
            {qual.transition.length > 0 && qual.action !== 'unconfirmed' ? (
              <ul className="cb-note__lines">
                {qual.transition.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            ) : (
              <p className="cb-note__lines">
                {qual.action === 'unconfirmed'
                  ? 'The guide has not published a transition route for this qualification yet. Speak to your Curriculum Development Manager.'
                  : 'The guide lists no transition information for this qualification — it is one of the routes to move to, rather than one to move away from.'}
              </p>
            )}
          </section>

          {qual.consider.length > 0 && (
            <section className="cb-consider">
              <h3 className="cb-section-title">Qualifications to consider</h3>
              <ul className="cb-consider__list">
                {qual.consider.map((title) => (
                  <li key={title}>
                    <span>{title}</span>
                    {onSearchFor && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => { onSearchFor(title); onClose(); }}
                      >
                        Find in guide
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="cb-modal__foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {inPlan && onRemove && (
            <button type="button" className="btn btn-danger" onClick={() => { onRemove(); onClose(); }}>
              Remove from plan
            </button>
          )}
          {!inPlan && onAdd && (
            <button type="button" className="btn btn-primary cb-btn-primary" onClick={() => { onAdd(); onClose(); }}>
              Add to plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
