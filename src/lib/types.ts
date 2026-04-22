export type ColumnType = 'text' | 'number' | 'url' | 'badge';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  filterable: boolean;
  searchable: boolean;
  type: ColumnType;
}

// ── Widgets ──────────────────────────────────────────────────────────────────

export type WidgetType = 'intro_banner' | 'callout_box' | 'stat_cards' | 'card_view' | 'footer_note';

export interface IntroBannerConfig { heading: string; subtitle: string; }
export interface CalloutBoxConfig  { text: string; }
export interface StatConfig        { label: string; type: 'total_rows' | 'unique_values'; column?: string; }
export interface StatCardsConfig   { stats: StatConfig[]; }
export interface CardViewConfig    { titleColumn: string; subtitleColumn?: string; badgeColumns?: string[]; linkColumn?: string; descriptionColumn?: string; }
export interface FooterNoteConfig  { text: string; showCount: boolean; }

export type WidgetConfig = IntroBannerConfig | CalloutBoxConfig | StatCardsConfig | CardViewConfig | FooterNoteConfig;

export interface Widget {
  id: string;
  type: WidgetType;
  config: WidgetConfig;
}

// ── Table config ─────────────────────────────────────────────────────────────

export interface TableConfig {
  title: string;
  description: string;
  columns: ColumnConfig[];
  primarySearchColumn: string;
  defaultSort: {
    column: string;
    direction: 'asc' | 'desc';
  };
  widgets?: Widget[];
}

export interface TableRecord {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  slug: string;
  config: TableConfig;
  is_published: boolean;
  tab_group_id: string | null;
  tab_order: number;
  created_at: string;
  updated_at: string;
}

export interface TableShare {
  id: string;
  table_id: string;
  owner_id: string;
  collaborator_email: string;
  created_at: string;
}

export interface TableRow {
  id: string;
  table_id: string;
  data: Record<string, string | number | null>;
  row_index: number;
  created_at: string;
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}
