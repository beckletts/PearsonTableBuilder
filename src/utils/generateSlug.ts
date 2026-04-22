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

export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || 'table';
  const candidate = `${base}-${randomSuffix()}`;

  let query = supabase.from('tables').select('slug').eq('slug', candidate);
  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;
  if (!data || data.length === 0) return candidate;

  // Collision (very unlikely with random suffix) — try once more
  return `${base}-${randomSuffix()}`;
}
