/**
 * Browse and filter the Options Guide. Used both to explore the guide on its
 * own and to pick qualifications for a course plan.
 */
import { useMemo } from 'react';
import { FAMILIES, LEVELS, SUBJECTS, type Qualification } from '../../data/optionsGuide';
import { filterQualifications, type GuideFilters } from '../../lib/courseBuilder';
import QualificationRow from './QualificationRow';

interface Props {
  filters: GuideFilters;
  onFiltersChange: (filters: GuideFilters) => void;
  /** Open the full guide entry for a qualification. */
  onOpen: (qual: Qualification) => void;
  /** Add to the plan. Omit to browse without a plan. */
  onAdd?: (qual: Qualification) => void;
  /** Ids already in the plan, shown as added rather than addable. */
  inPlanIds?: string[];
}

export default function QualificationBrowser({
  filters, onFiltersChange, onOpen, onAdd, inPlanIds = [],
}: Props) {
  const results = useMemo(() => filterQualifications(filters), [filters]);
  const set = (patch: Partial<GuideFilters>) => onFiltersChange({ ...filters, ...patch });
  const isFiltered =
    filters.search !== '' || filters.subject !== '' || filters.level !== '' ||
    filters.family !== '' || filters.status !== '' || filters.fundedOnly;

  return (
    <div className="cb-browser">
      <div className="cb-filters">
        <div className="cb-filters__search">
          <label className="input-label" htmlFor="cb-search">Qualification title or QN</label>
          <input
            id="cb-search"
            className="input"
            type="search"
            placeholder="e.g. Extended Certificate, or 601/7159/5"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>

        <div className="cb-filters__row">
          <div className="cb-filters__field">
            <label className="input-label" htmlFor="cb-subject">Subject</label>
            <select id="cb-subject" className="input" value={filters.subject} onChange={(e) => set({ subject: e.target.value })}>
              <option value="">All subjects</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="cb-filters__field">
            <label className="input-label" htmlFor="cb-level">Level</label>
            <select id="cb-level" className="input" value={filters.level} onChange={(e) => set({ level: e.target.value })}>
              <option value="">All levels</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="cb-filters__field">
            <label className="input-label" htmlFor="cb-family">Type</label>
            <select id="cb-family" className="input" value={filters.family} onChange={(e) => set({ family: e.target.value })}>
              <option value="">All types</option>
              {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="cb-filters__field">
            <label className="input-label" htmlFor="cb-status">Status for 2027</label>
            <select id="cb-status" className="input" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="available">Available</option>
              <option value="withdrawn">Being withdrawn</option>
              <option value="new">New</option>
            </select>
          </div>
        </div>

        <div className="cb-filters__foot">
          <label className="cb-check">
            <input
              type="checkbox"
              checked={filters.fundedOnly}
              onChange={(e) => set({ fundedOnly: e.target.checked })}
            />
            <span>Funded for 2027 only</span>
          </label>
          <span className="cb-filters__count">
            {results.length} of 287 qualifications
          </span>
          {isFiltered && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onFiltersChange({ search: '', subject: '', level: '', family: '', status: '', fundedOnly: false })}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="cb-empty">
          Nothing in the guide matches those filters. Try widening the subject or clearing the status filter.
        </p>
      ) : (
        <ul className="cb-results">
          {results.map((q) => (
            <QualificationRow
              key={q.id}
              qual={q}
              onOpen={() => onOpen(q)}
              onAdd={onAdd ? () => onAdd(q) : undefined}
              inPlan={inPlanIds.includes(q.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
