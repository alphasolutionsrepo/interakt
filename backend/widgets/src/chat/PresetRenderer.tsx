import type {
  PresetItem,
  ToolDisplayConfig,
  ToolDisplayField,
  ToolDisplayFieldRole,
} from '../shared/types';

/**
 * Lean preset renderer for chat responses. Ports the three most-used presets
 * from the demo's preset-renderers.tsx — single_card, item_grid, item_list —
 * into a framework-minimal form suitable for the drop-in bundle:
 *   - No Next.js Link (the /chat/document/:id route is demo-only; customer
 *     pages won't have it). Items open via their `link` field instead.
 *   - No lucide-react (inline SVGs).
 *   - No Tailwind classes (scoped widget.css handles layout).
 *   - No stagger/fade animations (pure CSS transitions where helpful).
 */

interface PresetRendererProps {
  preset: string;
  items: PresetItem[];
  config: ToolDisplayConfig;
}

export function PresetRenderer({ preset, items, config }: PresetRendererProps) {
  if (!items?.length) return null;
  switch (preset) {
    case 'single_card':
      return <SingleCard item={items[0]} config={config} />;
    case 'item_grid':
      return <ItemGrid items={items} config={config} />;
    case 'item_list':
      return <ItemList items={items} config={config} />;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field resolution
// ─────────────────────────────────────────────────────────────────────────────

interface Resolved {
  value: unknown;
  field: ToolDisplayField;
}

function getField(
  item: PresetItem,
  config: ToolDisplayConfig,
  role: ToolDisplayFieldRole,
): Resolved | null {
  const f = config.fields?.find((x) => x.role === role);
  if (!f) return null;
  const v = item.fields?.[f.source];
  if (v === undefined || v === null || v === '') return null;
  return { value: v, field: f };
}

function formatValue(value: unknown, field: ToolDisplayField): string {
  if (value === undefined || value === null) return '';
  switch (field.format) {
    case 'currency': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (isNaN(num)) return String(value);
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: field.currency || 'USD',
        }).format(num);
      } catch {
        return `$${num.toFixed(2)}`;
      }
    }
    case 'date': {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default:
      return String(value);
  }
}

function openLink(href: string | undefined) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  const stars = Math.min(Math.max(0, value), 5);
  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.3;
  return (
    <span class="ik-stars" aria-label={`${stars} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const state = i < full ? 'full' : i === full && hasHalf ? 'half' : 'empty';
        return <StarIcon key={i} state={state} />;
      })}
      <span class="ik-stars-num">{stars.toFixed(1)}</span>
    </span>
  );
}

function StarIcon({ state }: { state: 'full' | 'half' | 'empty' }) {
  const fill =
    state === 'full' ? 'currentColor' : state === 'half' ? 'url(#ik-half)' : 'none';
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" class={`ik-star ik-star--${state}`}>
      {state === 'half' && (
        <defs>
          <linearGradient id="ik-half">
            <stop offset="50%" stop-color="currentColor" />
            <stop offset="50%" stop-color="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z"
        fill={fill}
        stroke="currentColor"
        stroke-width="1"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function Thumbnail({ src, alt }: { src: string | undefined; alt: string }) {
  if (!src) {
    return (
      <div class="ik-card-image ik-card-image--placeholder" aria-hidden="true">
        <ImagePlaceholderIcon />
      </div>
    );
  }
  return (
    <img
      class="ik-card-image"
      src={src}
      alt={alt}
      loading="lazy"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
    />
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
      <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
      <path d="M21 16l-5-5-9 9" stroke="currentColor" stroke-width="1.5" fill="none" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7M17 7H9M17 7v8"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single card
// ─────────────────────────────────────────────────────────────────────────────

function SingleCard({ item, config }: { item: PresetItem; config: ToolDisplayConfig }) {
  const title = getField(item, config, 'title');
  const subtitle = getField(item, config, 'subtitle');
  const image = getField(item, config, 'image');
  const price = getField(item, config, 'price');
  const description = getField(item, config, 'description');
  const rating = getField(item, config, 'rating');
  const badge = getField(item, config, 'badge');
  const link = getField(item, config, 'link');

  const href = link ? String(link.value) : undefined;

  return (
    <div class="ik-card ik-card--single" onClick={() => openLink(href)} role={href ? 'link' : undefined}>
      <Thumbnail
        src={image ? String(image.value) : undefined}
        alt={title ? String(title.value) : 'Item image'}
      />
      <div class="ik-card-body">
        {badge && <span class="ik-badge">{formatValue(badge.value, badge.field)}</span>}
        <div class="ik-card-head">
          <div>
            {title && <h4 class="ik-card-title">{String(title.value)}</h4>}
            {subtitle && <div class="ik-card-subtitle">{String(subtitle.value)}</div>}
          </div>
          {price && <div class="ik-card-price">{formatValue(price.value, price.field)}</div>}
        </div>
        {rating && <Stars value={Number(rating.value)} />}
        {description && <p class="ik-card-desc">{String(description.value)}</p>}
        {href && (
          <a
            class="ik-card-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            View <ExternalIcon />
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item grid (2-column compact cards)
// ─────────────────────────────────────────────────────────────────────────────

function ItemGrid({ items, config }: { items: PresetItem[]; config: ToolDisplayConfig }) {
  return (
    <div class="ik-grid">
      {items.map((item, i) => (
        <GridCell key={item.id ?? i} item={item} config={config} />
      ))}
    </div>
  );
}

function GridCell({ item, config }: { item: PresetItem; config: ToolDisplayConfig }) {
  const title = getField(item, config, 'title');
  const subtitle = getField(item, config, 'subtitle');
  const image = getField(item, config, 'image');
  const price = getField(item, config, 'price');
  const rating = getField(item, config, 'rating');
  const badge = getField(item, config, 'badge');
  const link = getField(item, config, 'link');

  const href = link ? String(link.value) : undefined;

  return (
    <div class="ik-grid-cell" onClick={() => openLink(href)} role={href ? 'link' : undefined}>
      <div class="ik-grid-cell-img">
        <Thumbnail
          src={image ? String(image.value) : undefined}
          alt={title ? String(title.value) : 'Item image'}
        />
        {badge && <span class="ik-badge ik-badge--over">{formatValue(badge.value, badge.field)}</span>}
      </div>
      <div class="ik-grid-cell-body">
        {title && <div class="ik-card-title ik-card-title--sm">{String(title.value)}</div>}
        {subtitle && <div class="ik-card-subtitle">{String(subtitle.value)}</div>}
        <div class="ik-grid-cell-row">
          {rating && <Stars value={Number(rating.value)} />}
          {price && <div class="ik-card-price ik-card-price--sm">{formatValue(price.value, price.field)}</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item list (horizontal thumb + text)
// ─────────────────────────────────────────────────────────────────────────────

function ItemList({ items, config }: { items: PresetItem[]; config: ToolDisplayConfig }) {
  return (
    <ul class="ik-list">
      {items.map((item, i) => (
        <ListRow key={item.id ?? i} item={item} config={config} />
      ))}
    </ul>
  );
}

function ListRow({ item, config }: { item: PresetItem; config: ToolDisplayConfig }) {
  const title = getField(item, config, 'title');
  const subtitle = getField(item, config, 'subtitle');
  const image = getField(item, config, 'image');
  const price = getField(item, config, 'price');
  const description = getField(item, config, 'description');
  const link = getField(item, config, 'link');

  const href = link ? String(link.value) : undefined;

  return (
    <li class="ik-list-row" onClick={() => openLink(href)} role={href ? 'link' : undefined}>
      <Thumbnail
        src={image ? String(image.value) : undefined}
        alt={title ? String(title.value) : 'Item image'}
      />
      <div class="ik-list-row-body">
        <div class="ik-list-row-head">
          <div>
            {title && <div class="ik-card-title ik-card-title--sm">{String(title.value)}</div>}
            {subtitle && <div class="ik-card-subtitle">{String(subtitle.value)}</div>}
          </div>
          {price && (
            <div class="ik-card-price ik-card-price--sm">{formatValue(price.value, price.field)}</div>
          )}
        </div>
        {description && <p class="ik-card-desc ik-card-desc--sm">{String(description.value)}</p>}
      </div>
    </li>
  );
}
