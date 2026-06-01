export type Theme = 'light' | 'dark' | 'auto';

export type Placement = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/** Event emitted by the widget via config.onEvent. See README for the full catalog. */
export interface WidgetEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface BaseConfig {
  containerId: string;
  accessToken: string;
  apiBaseUrl?: string;
  theme?: Theme;
  /** Accent color (e.g. header, send button, launcher bubble). */
  primaryColor?: string;
  /** Panel background (falls back to theme default). */
  backgroundColor?: string;
  /** Input / assistant-bubble background (falls back to theme default). */
  surfaceColor?: string;
  /** Corner radius for the panel and buttons. CSS length, e.g. "12px" or "0". */
  borderRadius?: string;
  /** Font stack for the widget. Any valid CSS font-family value. */
  fontFamily?: string;
  /** Small logo shown in the chat header beside the title. */
  logoUrl?: string;
  analyticsEnabled?: boolean;
  onEvent?: (event: WidgetEvent) => void;
}

/**
 * Chat launcher mode:
 *   'floating' — widget renders its own bubble (default).
 *   'inline'   — widget renders expanded into the target container.
 *   'button'   — headless; widget renders nothing until the host calls
 *                window.ChatDropinUI.open(containerId). Useful when the
 *                customer has their own trigger element and wants to wire
 *                it themselves.
 */
export interface ChatConfig extends BaseConfig {
  chatTitle?: string;
  initialMessage?: string;
  launcher?: 'floating' | 'inline' | 'button';
  /** Corner of the viewport the floating launcher + panel anchor to. Default: bottom-right. */
  placement?: Placement;
}

export interface SearchConfig extends BaseConfig {
  mode?: 'modal' | 'inline';
  /**
   * When true (default), the widget calls `/api/v1/summarize` with the top
   * results and streams a short AI summary above them. Requires the search
   * experience to have `aiConfig.summary.enabled`; if not, the call fails
   * silently and no summary is shown. Set to `false` to skip the attempt
   * entirely (saves a request per search).
   */
  aiSummary?: boolean;
  /**
   * When true (default), the widget renders a row of category filter chips
   * derived from the first terms facet in the search response. Set to
   * `false` to hide the chip row — useful when the host prefers a cleaner
   * autocomplete-only experience or is going to surface filters elsewhere.
   */
  facets?: boolean;
  /**
   * Optional URL to send users when they click "See all results" in the
   * footer. If not set, the link is hidden. Useful when the host site has
   * a full search page that the overlay funnels to (e.g. '/search?q=…' —
   * the widget replaces the literal `:q` placeholder with the current query
   * if present).
   */
  seeAllUrl?: string;
}

export interface WidgetConfigResponse {
  name?: string;
  greeting?: string;
  description?: string;
  suggestedQuestions?: string[];
  placeholder?: string;
  showBranding?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool presets — rich cards/grids/lists the backend asks the UI to render
// (e.g. product search results). The `preset` SSE event carries one of these.
// ─────────────────────────────────────────────────────────────────────────────

export type ToolDisplayFieldRole =
  | 'title'
  | 'subtitle'
  | 'image'
  | 'price'
  | 'description'
  | 'rating'
  | 'badge'
  | 'link'
  | 'secondary';

export type ToolDisplayFieldFormat =
  | 'text'
  | 'currency'
  | 'stars'
  | 'date'
  | 'badge'
  | 'image_url'
  | 'link_url';

export interface ToolDisplayField {
  source: string;
  role: ToolDisplayFieldRole;
  label?: string;
  format?: ToolDisplayFieldFormat;
  currency?: string;
  priority?: 'primary' | 'secondary';
}

export interface ToolDisplayConfig {
  fields: ToolDisplayField[];
  preferredPresets?: string[];
}

export interface PresetItem {
  id?: string;
  fields: Record<string, unknown>;
}

export interface PresetPayload {
  items: PresetItem[];
  displayConfig: ToolDisplayConfig;
}

export interface ChatStreamEvent {
  type:
    | 'content'
    | 'tool_call'
    | 'tool_result'
    | 'step_start'
    | 'step_complete'
    | 'action_step'
    | 'preset'
    | 'sources'
    | 'classification'
    | 'done'
    | 'error';
  /** Token text for `content` events (pipeline emits { type: 'content', text }). */
  text?: string;
  /** Error description for `error` events. */
  message?: string;
  /** Session id for `done` events. */
  sessionId?: string;
  [key: string]: unknown;
}

/** Role the admin assigned to a field in the search experience's display config. */
export type DisplayFieldRole =
  | 'title'
  | 'subtitle'
  | 'description'
  | 'image'
  | 'price'
  | 'rating'
  | 'badge'
  | 'secondary'
  | 'link';

export interface DisplayField {
  fieldName: string;
  role: DisplayFieldRole;
  label?: string;
  order: number;
}

export interface DisplayConfig {
  displayFields: DisplayField[];
  layout?: {
    showScore?: boolean;
    showHighlights?: boolean;
  };
}

export interface SearchResultHit {
  id: string;
  score?: number;
  /** Document fields — this is what the backend's public search actually returns (not `fields`). */
  source?: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface Facet {
  field: string;
  /** Human-readable label, enriched from the index field's displayName. May be absent for older backends. */
  label?: string;
  type: 'terms' | 'range' | 'histogram' | string;
  buckets: FacetBucket[];
  missingCount?: number;
}

export interface SearchResponse {
  results?: SearchResultHit[];
  total?: { value: number; relation?: string };
  pagination?: {
    page: number;
    pageSize: number;
    totalPages?: number;
  };
  facets?: Facet[];
  displayConfig?: DisplayConfig | null;
  took?: number;
}
