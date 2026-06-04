export type ColumnType = 'text' | 'number' | 'url' | 'badge' | 'date';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  filterable: boolean;
  searchable: boolean;
  type: ColumnType;
  filterLabel?: boolean;       // show label above filter dropdown (default true)
  filterPlaceholder?: string;  // default option text, e.g. "All Universities"
  fontColor?: string;          // optional hex colour applied to all cell values in this column
  truncate?: boolean;          // clip long text to one line with ellipsis; full value shown on hover
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
  dataRefresh?: {
    enabled: boolean;
    customText: string;
    lastUpdated?: string;
  };
  filterOrder?: string[];
  searchPlaceholder?: string;
  stickyHeader?: boolean;
  hideLogo?: boolean;
  hideTitle?: boolean;
  requireFilter?: boolean;
  pagination?: {
    pageSize: number;
  };
  tracking?: {
    gaTrackingId?: string;
    cookieConsent?: {
      enabled: boolean;
      message?: string;
    };
  };
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

export interface LinkedDashboardShare {
  id: string;
  dashboard_id: string;
  owner_id: string;
  collaborator_email: string;
  access_level: 'view' | 'edit';
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

// ── Linked dashboards ─────────────────────────────────────────────────────────

export interface LinkedColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  filterable: boolean;
  searchable: boolean;
  inDetails?: boolean;
  type: ColumnType;
  sourceId?: string;
  filterPlaceholder?: string; // custom text for the filter dropdown's default option
  aliases?: string[];         // alternative source header names that map to this column
}

export interface ActionButton {
  label: string;
  url: string;
  emoji: string;
}

export interface InfoTile {
  label: string;
  value: string;
}

export interface LinkedInfoPanel {
  heading?: string;
  tiles: InfoTile[];
  note?: string;
}

export interface LinkedDashboardConfig {
  columns: LinkedColumnConfig[];
  sources: { id: string; name: string; join_key_column: string }[];
  defaultSort: { column: string; direction: 'asc' | 'desc' };
  filterOrder?: string[];
  allowColumnCustomise?: boolean;
  dataRefresh?: {
    enabled: boolean;
    customText: string;
    lastUpdated?: string;
  };
  actionButtons?: ActionButton[];
  infoPanel?: LinkedInfoPanel;
  tracking?: {
    gaTrackingId?: string;
    cookieConsent?: {
      enabled: boolean;
      message?: string;
    };
  };
}

export interface LinkedDashboard {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  slug: string;
  join_key: string;
  config: LinkedDashboardConfig;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface LinkedSource {
  id: string;
  dashboard_id: string;
  name: string;
  join_key_column: string;
  row_count: number;
  created_at: string;
}

export interface LinkedRow {
  id: string;
  dashboard_id: string;
  source_id: string;
  join_value: string;
  data: Record<string, string | number | null>;
  row_index: number;
}

export interface ParsedSource {
  name: string;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  columnSuggestions?: ColumnConfig[];
}

export interface JoinDetectResult {
  canonical_name: string;
  confidence: number;
  mappings: { source_name: string; column: string; confidence: number }[];
  reasoning: string;
  pattern: string;
}

export type DataQualityFixType = 'strip_html' | 'trim_whitespace' | 'normalise_case' | 'convert_date_serial' | 'flag_only';

export interface DataQualityIssue {
  column: string;
  type: 'html_artifacts' | 'text_date' | 'text_number' | 'whitespace' | 'mixed_case';
  description: string;
  examples: string[];
  suggestedFix: DataQualityFixType;
  fixDescription: string;
}
