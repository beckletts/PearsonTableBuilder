/**
 * Actions on a course builder that more than one surface needs — the dashboard
 * card and the workspace both publish, and both should leave a history entry.
 */
import { supabase } from './supabase';
import { generateUniqueCoursePlanSlug } from '../utils/generateSlug';
import { normaliseConfig, type CoursePlan } from './courseBuilder';

export type CoursePlanAction = 'created' | 'published' | 'unpublished' | 'duplicated';

/**
 * Record something happening to a builder. Best-effort: history is useful but
 * never worth failing the action the user actually asked for, and it is
 * unavailable until migration-v13 is applied.
 */
export async function logCoursePlanAction(planId: string, action: CoursePlanAction): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('course_plan_audit_log').insert({
    plan_id: planId,
    user_id: user.id,
    user_email: user.email ?? 'unknown',
    action,
  });
  if (error) console.warn('[Course builder] Could not record history:', error.message);
}

/** Publish or unpublish, and note it in the history. */
export async function setCoursePlanPublished(planId: string, published: boolean): Promise<string | null> {
  const { error } = await supabase
    .from('course_plans')
    .update({ is_published: published })
    .eq('id', planId);
  if (error) return error.message;
  void logCoursePlanAction(planId, published ? 'published' : 'unpublished');
  return null;
}

/**
 * Copy a builder for the signed-in user. The copy always starts unpublished so
 * a duplicate never quietly goes live on a link nobody has seen.
 */
export async function duplicateCoursePlan(plan: CoursePlan): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'You must be signed in to duplicate a course builder.';

  const title = `Copy of ${plan.title}`;
  const { data, error } = await supabase
    .from('course_plans')
    .insert({
      owner_id: user.id,
      title,
      description: plan.description,
      slug: await generateUniqueCoursePlanSlug(title),
      config: normaliseConfig(plan.config),
      is_published: false,
    })
    .select('id')
    .single();
  if (error || !data) return error?.message ?? 'Could not duplicate the course builder.';

  void logCoursePlanAction((data as { id: string }).id, 'duplicated');
  return null;
}
