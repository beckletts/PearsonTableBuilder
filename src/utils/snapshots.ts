import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAllRows';
import type { TableConfig } from '../lib/types';

// How many snapshots to retain per table. Oldest beyond this are pruned.
const MAX_SNAPSHOTS = 10;
const BATCH = 500;

// Lightweight snapshot metadata — does NOT include the (potentially large) rows blob.
export interface SnapshotMeta {
  id: string;
  table_id: string;
  user_email: string;
  reason: string;
  config: TableConfig;
  row_count: number;
  created_at: string;
}

/**
 * Capture the CURRENT live state (config + rows) of a table as a restorable
 * snapshot. Call this immediately BEFORE overwriting a table's data. Tables
 * with no existing rows are skipped — there is nothing to roll back to.
 */
export async function createSnapshot(tableId: string, reason: string): Promise<void> {
  const { data: t } = await supabase.from('tables').select('config').eq('id', tableId).single();
  if (!t) return;

  const rows = await fetchAllRows(tableId);
  if (rows.length === 0) return; // nothing worth snapshotting

  const { data: { session } } = await supabase.auth.getSession();

  const { error } = await supabase.from('table_snapshots').insert({
    table_id: tableId,
    created_by: session?.user.id ?? null,
    user_email: session?.user.email ?? '',
    reason,
    config: t.config,
    rows: rows.map((r) => r.data),
    row_count: rows.length,
  });
  if (error) throw error;

  // Prune anything older than the most recent MAX_SNAPSHOTS
  const { data: all } = await supabase
    .from('table_snapshots')
    .select('id')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false });
  if (all && all.length > MAX_SNAPSHOTS) {
    const stale = all.slice(MAX_SNAPSHOTS).map((s) => s.id);
    await supabase.from('table_snapshots').delete().in('id', stale);
  }
}

/** List a table's snapshots, newest first, without loading the heavy rows blob. */
export async function listSnapshots(tableId: string): Promise<SnapshotMeta[]> {
  const { data, error } = await supabase
    .from('table_snapshots')
    .select('id, table_id, user_email, reason, config, row_count, created_at')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SnapshotMeta[]) ?? [];
}

/**
 * Restore a snapshot: the current live state is first captured (so the restore
 * is itself reversible), then the table's config and rows are replaced with the
 * snapshot's contents.
 */
export async function restoreSnapshot(snapshotId: string, tableId: string): Promise<void> {
  // Safety net: snapshot the current state before we overwrite it
  await createSnapshot(tableId, 'Auto-saved before restore');

  const { data: snap, error: snapErr } = await supabase
    .from('table_snapshots')
    .select('config, rows')
    .eq('id', snapshotId)
    .single();
  if (snapErr || !snap) throw snapErr ?? new Error('Snapshot not found.');

  const { error: cfgErr } = await supabase
    .from('tables')
    .update({ config: snap.config })
    .eq('id', tableId);
  if (cfgErr) throw cfgErr;

  await supabase.from('table_rows').delete().eq('table_id', tableId);

  const rows = (snap.rows as Record<string, string | number | null>[]) ?? [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((data, j) => ({
      table_id: tableId,
      data,
      row_index: i + j,
    }));
    const { error } = await supabase.from('table_rows').insert(batch);
    if (error) throw error;
  }
}
