import { supabase } from '../lib/supabase';
import type { TableRow } from '../lib/types';

const PAGE_SIZE = 1000;

export async function fetchAllRows(tableId: string): Promise<TableRow[]> {
  const all: TableRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('table_rows')
      .select('*')
      .eq('table_id', tableId)
      .order('row_index')
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as TableRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
