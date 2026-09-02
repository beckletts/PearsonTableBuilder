/**
 * The plan itself: what has been chosen, how big it adds up to, and what the
 * guide says a teacher should watch out for.
 */
import type { Qualification } from '../../data/optionsGuide';
import type { CoursePlanConfig, PlanAnalysis } from '../../lib/courseBuilder';
import { glhLabel, STATUS_LABEL } from '../../lib/courseBuilder';
import { statusTone } from './QualificationRow';

interface Props {
  config: CoursePlanConfig;
  analysis: PlanAnalysis;
  onOpen: (qual: Qualification) => void;
  onRemove: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  onNotesChange: (notes: string) => void;
  /** Search the guide for a suggested replacement. */
  onSearchFor: (title: string) => void;
  onExport: () => void;
  /** Whether the author's notes appear on the shared page. */
  shareNotes: boolean;
  onShareNotesChange: (shareNotes: boolean) => void;
}

export default function PlanPanel({
  config, analysis, onOpen, onRemove, onNoteChange, onNotesChange, onSearchFor, onExport,
  shareNotes, onShareNotesChange,
}: Props) {
  const { quals, missing, totalGlh, unknownGlhCount, checks, suggestions } = analysis;

  return (
    <div className="cb-plan">
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
        <h2 className="cb-section-title">Your programme</h2>
        {quals.length === 0 && missing.length === 0 ? (
          <p className="cb-empty">
            Nothing chosen yet. Search the guide and add the qualifications you are considering —
            the checks below update as you go.
          </p>
        ) : (
          <ul className="cb-plan__items">
            {quals.map((q) => {
              const item = config.items.find((i) => i.id === q.id);
              return (
                <li key={q.id} className={`cb-plan__item cb-plan__item--${statusTone(q)}`}>
                  <div className="cb-plan__item-head">
                    <button type="button" className="cb-plan__item-title" onClick={() => onOpen(q)}>
                      {q.title}
                    </button>
                    <button
                      type="button"
                      className="cb-plan__remove"
                      onClick={() => onRemove(q.id)}
                      aria-label={`Remove ${q.title} from the plan`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="cb-row__meta">
                    <span className={`cb-tag cb-tag--${statusTone(q)}`}>{STATUS_LABEL[q.status2027]}</span>
                    <span className="cb-tag">{q.family}</span>
                    <span className="cb-tag">{q.level}</span>
                    <span className="cb-tag">{glhLabel(q)}</span>
                  </div>
                  <input
                    className="input cb-plan__note"
                    placeholder="Why this sits in the programme (optional)"
                    value={item?.note ?? ''}
                    onChange={(e) => onNoteChange(q.id, e.target.value)}
                    aria-label={`Note for ${q.title}`}
                  />
                </li>
              );
            })}
            {missing.map((m) => (
              <li key={m.id} className="cb-plan__item cb-plan__item--risk">
                <div className="cb-plan__item-head">
                  <span className="cb-plan__item-title cb-plan__item-title--plain">{m.title}</span>
                  <button
                    type="button"
                    className="cb-plan__remove"
                    onClick={() => onRemove(m.id)}
                    aria-label={`Remove ${m.title} from the plan`}
                  >
                    ✕
                  </button>
                </div>
                <p className="cb-plan__missing">Not in the current edition of the guide.</p>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {suggestions.length > 0 && (
        <section>
          <h2 className="cb-section-title">The guide suggests considering</h2>
          <p className="cb-section-sub">
            Routes listed against the at-risk choices in this plan.
          </p>
          <ul className="cb-consider__list">
            {suggestions.map((title) => (
              <li key={title}>
                <span>{title}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSearchFor(title)}>
                  Find in guide
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="cb-section-title">Planning notes</h2>
        <textarea
          className="input cb-plan__notes"
          rows={4}
          placeholder="Staffing, timetabling, what to confirm with your Curriculum Development Manager…"
          value={config.notes ?? ''}
          onChange={(e) => onNotesChange(e.target.value)}
          aria-label="Planning notes"
        />
        {/* Notes are usually internal, so they stay off the shared page unless
            the author says otherwise. */}
        <label className="cb-check cb-plan__share-notes">
          <input
            type="checkbox"
            checked={shareNotes}
            onChange={(e) => onShareNotesChange(e.target.checked)}
          />
          <span>Show my notes on the shared and embedded page</span>
        </label>
      </section>

      <button
        type="button"
        className="btn btn-secondary cb-plan__export"
        onClick={onExport}
        disabled={quals.length === 0}
      >
        Export to Excel
      </button>
    </div>
  );
}
