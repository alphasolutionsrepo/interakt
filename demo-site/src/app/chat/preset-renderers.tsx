'use client';

import { useMemo, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ExternalLink, Star, ImageIcon, ArrowRight } from 'lucide-react';

// ============================================================================
// Types (mirrors backend ToolDisplayConfig)
// ============================================================================

export type ToolDisplayFieldRole =
  | 'title' | 'subtitle' | 'image' | 'price' | 'description'
  | 'rating' | 'badge' | 'link' | 'secondary';

export type ToolDisplayFieldFormat =
  | 'text' | 'currency' | 'stars' | 'date' | 'badge' | 'image_url' | 'link_url';

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

// ============================================================================
// Field value extraction helpers
// ============================================================================

function getField(
  item: PresetItem,
  config: ToolDisplayConfig,
  role: ToolDisplayFieldRole,
): { value: unknown; field: ToolDisplayField } | null {
  const f = config.fields.find((f) => f.role === role);
  if (!f) return null;
  const val = item.fields[f.source];
  if (val === undefined || val === null || val === '') return null;
  return { value: val, field: f };
}

/** Check if config has a field with given role (regardless of item data) */
function hasFieldRole(config: ToolDisplayConfig, role: ToolDisplayFieldRole): boolean {
  return config.fields.some((f) => f.role === role);
}

function formatValue(value: unknown, field: ToolDisplayField): string {
  if (value === undefined || value === null) return '';

  switch (field.format) {
    case 'currency': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (isNaN(num)) return String(value);
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: field.currency || 'USD',
      }).format(num);
    }
    case 'date': {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default:
      return String(value);
  }
}

function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  const stars = Math.min(Math.max(0, value), max);
  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.3;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i < full
              ? 'text-amber-400 fill-amber-400'
              : i === full && hasHalf
                ? 'text-amber-400 fill-amber-400/50'
                : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{value}</span>
    </div>
  );
}

// ============================================================================
// DETAIL LINK HELPER
// ============================================================================

/** Returns the detail page URL for an item, or null if no id exists */
function getDetailHref(item: PresetItem): string | null {
  return item.id ? `/chat/document/${encodeURIComponent(item.id)}` : null;
}

/** Wraps children in a Next.js Link if the item has an id, otherwise renders children as-is */
function DetailLink({
  item,
  children,
  className = '',
}: {
  item: PresetItem;
  children: React.ReactNode;
  className?: string;
}) {
  const href = getDetailHref(item);
  if (!href) return <>{children}</>;

  return (
    <Link href={href} className={`group/detail ${className}`}>
      {children}
    </Link>
  );
}

// ============================================================================
// STAGGERED ANIMATION WRAPPER
// ============================================================================

/**
 * Wraps a child element and animates it in with a staggered delay.
 * Uses IntersectionObserver so items only animate when scrolled into view.
 */
function StaggerItem({
  index,
  delayMs = 60,
  children,
  className = '',
}: {
  index: number;
  delayMs?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Small timeout so the initial render doesn't flash
    const timer = setTimeout(() => setVisible(true), index * delayMs);
    return () => clearTimeout(timer);
  }, [index, delayMs]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: `opacity 0.35s ease-out, transform 0.35s ease-out`,
      }}
    >
      {children}
    </div>
  );
}

/** Fade-in for single elements (cards, tables) — no stagger needed */
function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// PRESET ROUTER
// ============================================================================

export function PresetRenderer({
  preset,
  items,
  displayConfig,
}: {
  preset: string;
  items: PresetItem[];
  displayConfig: ToolDisplayConfig;
}) {
  if (!items.length) return null;

  switch (preset) {
    case 'single_card':
      return <SingleCardRenderer item={items[0]} config={displayConfig} />;
    case 'item_grid':
      return <ItemGridRenderer items={items} config={displayConfig} />;
    case 'item_list':
      return <ItemListRenderer items={items} config={displayConfig} />;
    case 'comparison_table':
      return <ComparisonTableRenderer items={items} config={displayConfig} />;
    default:
      return null;
  }
}

// ============================================================================
// SINGLE CARD
// ============================================================================

function SingleCardRenderer({ item, config }: { item: PresetItem; config: ToolDisplayConfig }) {
  const title = getField(item, config, 'title');
  const subtitle = getField(item, config, 'subtitle');
  const image = getField(item, config, 'image');
  const price = getField(item, config, 'price');
  const description = getField(item, config, 'description');
  const rating = getField(item, config, 'rating');
  const badge = getField(item, config, 'badge');
  const link = getField(item, config, 'link');

  return (
    <FadeIn className="mt-3">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Image */}
        {(image || hasFieldRole(config, 'image')) && (
          <div className="w-full h-48 bg-muted relative">
            {image ? (
              <img
                src={String(image.value)}
                alt={title ? String(title.value) : 'Product image'}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
              </div>
            )}
          </div>
        )}

        <div className="p-4 space-y-2">
          {badge && (
            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {formatValue(badge.value, badge.field)}
            </span>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title && (
                <h3 className="text-base font-semibold text-foreground truncate">
                  {String(title.value)}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {String(subtitle.value)}
                </p>
              )}
            </div>
            {price && (
              <span className="text-lg font-bold text-foreground shrink-0">
                {formatValue(price.value, price.field)}
              </span>
            )}
          </div>

          {rating && <RatingStars value={Number(rating.value)} />}

          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {String(description.value)}
            </p>
          )}

          <SecondaryFields item={item} config={config} />

          <div className="flex items-center gap-3 mt-1">
            {item.id && (
              <Link
                href={`/chat/document/${encodeURIComponent(item.id)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                View details <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {link && (
              <a
                href={String(link.value)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                External link <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </FadeIn>
  );
}

// ============================================================================
// ITEM GRID
// ============================================================================

function ItemGridRenderer({ items, config }: { items: PresetItem[]; config: ToolDisplayConfig }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {items.slice(0, 8).map((item, i) => (
        <StaggerItem key={item.id ?? i} index={i} delayMs={80}>
          <ItemGridCard item={item} config={config} index={i} />
        </StaggerItem>
      ))}
    </div>
  );
}

function ItemGridCard({ item, config, index }: { item: PresetItem; config: ToolDisplayConfig; index: number }) {
  const title = getField(item, config, 'title');
  const image = getField(item, config, 'image');
  const price = getField(item, config, 'price');
  const rating = getField(item, config, 'rating');
  const badge = getField(item, config, 'badge');
  const subtitle = getField(item, config, 'subtitle');
  const detailHref = getDetailHref(item);

  const Wrapper = detailHref
    ? ({ children, className }: { children: React.ReactNode; className: string }) => (
        <Link href={detailHref} className={className}>{children}</Link>
      )
    : ({ children, className }: { children: React.ReactNode; className: string }) => (
        <div className={className}>{children}</div>
      );

  return (
    <Wrapper
      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden hover:shadow-md transition-all h-full block cursor-pointer"
    >
      {/* Image */}
      {(image || hasFieldRole(config, 'image')) && (
        <div className="w-full h-32 bg-muted relative">
          {image ? (
            <>
              <img
                src={String(image.value)}
                alt={title ? String(title.value) : ''}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {badge && (
                <span className="absolute top-2 left-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/70 text-white">
                  {formatValue(badge.value, badge.field)}
                </span>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/20" />
            </div>
          )}
        </div>
      )}

      <div className="p-3 space-y-1">
        {title && (
          <h4 className="text-sm font-semibold text-foreground truncate">
            {String(title.value)}
          </h4>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">
            {String(subtitle.value)}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {price && (
            <span className="text-sm font-bold text-foreground">
              {formatValue(price.value, price.field)}
            </span>
          )}
          {rating && <RatingStars value={Number(rating.value)} />}
        </div>
      </div>
    </Wrapper>
  );
}

// ============================================================================
// ITEM LIST
// ============================================================================

function ItemListRenderer({ items, config }: { items: PresetItem[]; config: ToolDisplayConfig }) {
  return (
    <div className="mt-3 space-y-2">
      {items.slice(0, 10).map((item, i) => (
        <StaggerItem key={item.id ?? i} index={i} delayMs={60}>
          <ItemListRow item={item} config={config} index={i} />
        </StaggerItem>
      ))}
    </div>
  );
}

function ItemListRow({ item, config, index }: { item: PresetItem; config: ToolDisplayConfig; index: number }) {
  const title = getField(item, config, 'title');
  const subtitle = getField(item, config, 'subtitle');
  const price = getField(item, config, 'price');
  const badge = getField(item, config, 'badge');
  const description = getField(item, config, 'description');
  const link = getField(item, config, 'link');
  const detailHref = getDetailHref(item);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
      {/* Rank number */}
      <span className="text-xs font-bold text-muted-foreground bg-muted rounded-md w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
        {index + 1}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h4 className="text-sm font-semibold text-foreground truncate">
                {detailHref ? (
                  <Link href={detailHref} className="hover:text-primary transition-colors">
                    {String(title.value)}
                  </Link>
                ) : link ? (
                  <a href={String(link.value)} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    {String(title.value)}
                  </a>
                ) : (
                  String(title.value)
                )}
              </h4>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{String(subtitle.value)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {formatValue(badge.value, badge.field)}
              </span>
            )}
            {price && (
              <span className="text-sm font-bold text-foreground">
                {formatValue(price.value, price.field)}
              </span>
            )}
          </div>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(description.value)}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPARISON TABLE
// ============================================================================

function ComparisonTableRenderer({ items, config }: { items: PresetItem[]; config: ToolDisplayConfig }) {
  // Use all primary fields as rows, items as columns
  const primaryFields = useMemo(
    () => config.fields.filter((f) => f.priority !== 'secondary'),
    [config.fields],
  );

  const displayItems = items.slice(0, 4); // max 4 columns for readability

  return (
    <FadeIn className="mt-3">
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">
                Field
              </th>
              {displayItems.map((item, i) => {
                const title = getField(item, config, 'title');
                const detailHref = getDetailHref(item);
                const label = title ? String(title.value) : `Item ${i + 1}`;
                return (
                  <th key={item.id ?? i} className="text-left px-3 py-2 text-xs font-semibold text-foreground">
                    {detailHref ? (
                      <Link href={detailHref} className="hover:text-primary transition-colors">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {primaryFields
              .filter((f) => f.role !== 'title') // title is in the header
              .map((field) => (
                <tr key={field.source} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    {field.label ?? field.role}
                  </td>
                  {displayItems.map((item, i) => {
                    const val = item.fields[field.source];
                    return (
                      <td key={item.id ?? i} className="px-3 py-2 text-sm text-foreground">
                        {val !== undefined && val !== null ? (
                          field.format === 'stars' ? (
                            <RatingStars value={Number(val)} />
                          ) : field.format === 'image_url' ? (
                            <img src={String(val)} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            formatValue(val, field)
                          )
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
    </FadeIn>
  );
}

// ============================================================================
// SECONDARY FIELDS (shared helper)
// ============================================================================

function SecondaryFields({ item, config }: { item: PresetItem; config: ToolDisplayConfig }) {
  const secondary = config.fields.filter(
    (f) => f.priority === 'secondary' && item.fields[f.source] != null,
  );

  if (secondary.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
      {secondary.map((f) => (
        <div key={f.source} className="text-xs text-muted-foreground">
          <span className="font-medium">{f.label ?? f.source}:</span>{' '}
          {formatValue(item.fields[f.source], f)}
        </div>
      ))}
    </div>
  );
}
