import { createClient } from '@supabase/supabase-js';
import type { TableConfig } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; created_at: string };
        Insert: { id: string; full_name?: string | null };
        Update: { full_name?: string | null };
      };
      tables: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          slug: string;
          config: TableConfig;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tables']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tables']['Insert']>;
      };
      table_rows: {
        Row: {
          id: string;
          table_id: string;
          data: Record<string, string | number | null>;
          row_index: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['table_rows']['Row'], 'id' | 'created_at'>;
      };
    };
  };
};
