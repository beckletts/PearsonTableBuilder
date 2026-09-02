/**
 * The public view of a published course plan, at /cp/<slug>.
 *
 * No sign-in required, and it is the same URL an embed points at, so it stays
 * self-contained: no app nav, no editing, and it must sit happily inside a
 * narrow iframe.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { analysePlan, normaliseConfig, type CoursePlan } from '../lib/courseBuilder';
import CoursePlanReadView from '../components/course/CoursePlanReadView';
import PearsonLogo from '../components/layout/PearsonLogo';
import './CoursePage.css';

export default function PublicCoursePlanPage() {
  const { slug } = useParams<{ slug: string }>();
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('course_plans')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      // An unpublished plan is invisible to the public policy, so a miss here
      // covers both "no such plan" and "not published".
      if (!data || !(data as CoursePlan).is_published) {
        setNotFound(true);
      } else {
        setPlan(data as CoursePlan);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <main className="cb-public">
        <div className="cb-loading"><div className="spinner spinner-lg" /></div>
      </main>
    );
  }

  if (notFound || !plan) {
    return (
      <main className="cb-public">
        <div className="cb-public__missing">
          <h1 className="cb-read__title">Course plan not available</h1>
          <p className="text-soft mt-8">
            This plan may have been unpublished or the link may be wrong. Check the link with
            whoever shared it with you.
          </p>
        </div>
      </main>
    );
  }

  const config = normaliseConfig(plan.config);

  return (
    <main className="cb-public">
      <div className="cb-public__inner">
        <div className="cb-public__brand">
          {/* The logo defaults to white for the dark app nav; this page is light. */}
          <PearsonLogo width={96} color="#0D004D" />
        </div>
        <CoursePlanReadView
          title={plan.title}
          description={plan.description}
          config={config}
          analysis={analysePlan(config)}
        />
      </div>
    </main>
  );
}
