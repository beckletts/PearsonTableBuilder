/** One qualification in the browse list. */
import type { Qualification } from '../../data/optionsGuide';
import { glhLabel, STATUS_LABEL } from '../../lib/courseBuilder';

/** Status maps to the accent that carries the same meaning across the feature. */
export function statusTone(qual: Qualification): 'ok' | 'watch' | 'risk' {
  if (qual.status2027 === 'withdrawn' || qual.funded2027 === 'not-funded') return 'risk';
  if (qual.status2027 === 'new' || qual.funded2027 === 'tba') return 'watch';
  return 'ok';
}

interface Props {
  qual: Qualification;
  onOpen: () => void;
  onAdd?: () => void;
  inPlan: boolean;
}

export default function QualificationRow({ qual, onOpen, onAdd, inPlan }: Props) {
  return (
    <li className={`cb-row cb-row--${statusTone(qual)}`}>
      <button type="button" className="cb-row__main" onClick={onOpen}>
        <span className="cb-row__title">{qual.title}</span>
        <span className="cb-row__meta">
          <span className={`cb-tag cb-tag--${statusTone(qual)}`}>{STATUS_LABEL[qual.status2027]}</span>
          <span className="cb-tag">{qual.family}</span>
          <span className="cb-tag">{qual.level}</span>
          <span className="cb-tag">{glhLabel(qual)}</span>
          <span className="cb-row__qn">{qual.qn}</span>
        </span>
      </button>
      {onAdd && (
        inPlan ? (
          <span className="cb-row__added" aria-label="Already in your plan">In plan</span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm cb-row__add" onClick={onAdd}>
            Add
          </button>
        )
      )}
    </li>
  );
}
