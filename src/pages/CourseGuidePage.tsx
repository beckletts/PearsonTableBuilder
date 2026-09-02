/**
 * Read the Options Guide on its own, without building a plan — for looking up
 * where a single qualification stands.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Qualification } from '../data/optionsGuide';
import { emptyFilters, type GuideFilters } from '../lib/courseBuilder';
import PearsonNav from '../components/layout/PearsonNav';
import QualificationBrowser from '../components/course/QualificationBrowser';
import QualificationDetail from '../components/course/QualificationDetail';
import './CoursePage.css';

interface Props { user: User }

export default function CourseGuidePage({ user }: Props) {
  const [filters, setFilters] = useState<GuideFilters>(emptyFilters);
  const [open, setOpen] = useState<Qualification | null>(null);

  return (
    <div>
      <PearsonNav user={user} />
      <main className="cb-page">
        <nav className="cb-breadcrumb">
          <Link to="/course">Course builder</Link> <span aria-hidden="true">/</span> The Options Guide
        </nav>

        <header className="cb-guide-head">
          <h1 className="cb-hero__title">The Options Guide</h1>
          <p className="cb-hero__sub">
            Every post-16 qualification in the guide, with its status and funding for first teach 2027.
            Open any one to read the transition route and what to consider instead.
          </p>
        </header>

        <QualificationBrowser
          filters={filters}
          onFiltersChange={setFilters}
          onOpen={setOpen}
        />

        {open && (
          <QualificationDetail
            qual={open}
            inPlan={false}
            onClose={() => setOpen(null)}
            onSearchFor={(title) => setFilters({ ...emptyFilters, search: title })}
          />
        )}
      </main>
    </div>
  );
}
