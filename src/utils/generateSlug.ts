import { supabase } from '../lib/supabase';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Build a slug that no row in `table` is already using. */
async function uniqueSlug(table: string, title: string, fallback: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || fallback;
  const candidate = `${base}-${randomSuffix()}`;

  let query = supabase.from(table).select('slug').eq('slug', candidate);
  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;
  if (!data || data.length === 0) return candidate;

  // Collision (very unlikely with random suffix) — try once more
  return `${base}-${randomSuffix()}`;
}

export function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  return uniqueSlug('tables', title, 'table', excludeId);
}

export function generateUniqueCoursePlanSlug(title: string, excludeId?: string): Promise<string> {
  return uniqueSlug('course_plans', title, 'course-plan', excludeId);
}
