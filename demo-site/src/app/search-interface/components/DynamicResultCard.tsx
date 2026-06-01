'use client';

import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Star, Sparkles } from 'lucide-react';
import type { SearchResult, DisplayConfig, DisplayField } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

interface DynamicResultCardProps {
  result: SearchResult;
  displayConfig?: DisplayConfig | null;
  viewMode?: 'list' | 'grid';
  /** Callback when user clicks "Ask AI" to chat about this specific result */
  onAskAI?: (result: SearchResult) => void;
  /** Override to force showing relevance scores regardless of displayConfig */
  forceShowScore?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  const parts = fieldName.split('.');
  let value: unknown = source;
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

function formatPrice(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return `$${value.toFixed(2)}`;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num)) return `$${num.toFixed(2)}`;
    return value.includes('$') ? value : `$${value}`;
  }
  return String(value);
}

function getFieldsByRole(displayConfig: DisplayConfig | null | undefined): Record<string, DisplayField | undefined> {
  if (!displayConfig?.displayFields) return {};

  const sorted = [...displayConfig.displayFields].sort((a, b) => a.order - b.order);
  const result: Record<string, DisplayField | undefined> = {};

  for (const field of sorted) {
    if (!result[field.role]) {
      result[field.role] = field;
    }
  }

  return result;
}

function getAllFieldsByRole(displayConfig: DisplayConfig | null | undefined, role: string): DisplayField[] {
  if (!displayConfig?.displayFields) return [];
  return displayConfig.displayFields
    .filter(f => f.role === role)
    .sort((a, b) => a.order - b.order);
}

function getHighlight(highlights: Record<string, string[]> | undefined, fieldName: string): string | undefined {
  if (!highlights) return undefined;

  if (highlights[fieldName]?.length) {
    return highlights[fieldName][0];
  }

  for (const key of Object.keys(highlights)) {
    if (key.startsWith(fieldName)) {
      return highlights[key][0];
    }
  }

  return undefined;
}

function HighlightedText({ html, className }: { html: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function getItemLink(
  result: SearchResult,
  displayConfig: DisplayConfig | null | undefined
): { href: string; isExternal: boolean } {
  // Check for configured link field
  const linkField = displayConfig?.displayFields?.find(f => f.role === 'link');
  if (linkField) {
    const linkValue = getFieldValue(result.source, linkField.fieldName);
    if (linkValue) {
      const href = String(linkValue);
      return {
        href,
        isExternal: href.startsWith('http://') || href.startsWith('https://'),
      };
    }
  }

  // Fallback to common link field names
  const fallbackLinkFields = ['link', 'url', 'detailUrl', 'productUrl', 'href'];
  for (const fieldName of fallbackLinkFields) {
    const value = result.source[fieldName];
    if (value) {
      const href = String(value);
      return {
        href,
        isExternal: href.startsWith('http://') || href.startsWith('https://'),
      };
    }
  }

  // Generate internal detail page link
  return {
    href: `/search-interface/item/${encodeURIComponent(result.id)}`,
    isExternal: false,
  };
}

// ============================================================================
// LIST CARD COMPONENT
// ============================================================================

function ListResultCard({ result, displayConfig, onAskAI, forceShowScore }: DynamicResultCardProps) {
  const fields = getFieldsByRole(displayConfig);
  const badges = getAllFieldsByRole(displayConfig, 'badge');
  const secondaryFields = getAllFieldsByRole(displayConfig, 'secondary');

  const titleFieldName = fields.title?.fieldName ?? 'title';
  const title = fields.title ? getFieldValue(result.source, fields.title.fieldName) : undefined;
  const subtitle = fields.subtitle ? getFieldValue(result.source, fields.subtitle.fieldName) : undefined;
  const descriptionFieldName = fields.description?.fieldName ?? 'description';
  const description = fields.description ? getFieldValue(result.source, fields.description.fieldName) : undefined;
  const image = fields.image ? getFieldValue(result.source, fields.image.fieldName) : undefined;
  const price = fields.price ? getFieldValue(result.source, fields.price.fieldName) : undefined;

  const displayTitle = String(title ?? result.source.title ?? result.source.name ?? 'Untitled');
  const rawSubtitle = subtitle ?? result.source.subtitle ?? result.source.category;
  const displaySubtitle = rawSubtitle ? String(rawSubtitle) : null;
  const rawDescription = description ?? result.source.description ?? result.source.shortDescription;
  const displayDescription = rawDescription ? String(rawDescription) : null;
  const displayImage = image ?? result.source.image ?? result.source.primaryImageUrl ?? result.source.imageUrl;
  const displayPrice = price ?? result.source.price ?? result.source.minPrice;

  // Get rating if available
  const rating = result.source.rating as number | undefined;
  const ratingCount = result.source.ratingCount as number | undefined;

  const showScore = forceShowScore || (displayConfig?.layout?.showScore ?? false);
  const showHighlights = displayConfig?.layout?.showHighlights ?? true;

  const titleHighlight = showHighlights ? getHighlight(result.highlights, titleFieldName) : undefined;
  const descriptionHighlight = showHighlights ? getHighlight(result.highlights, descriptionFieldName) : undefined;

  // Get item link
  const { href: itemLink } = getItemLink(result, displayConfig);

  const cardContent = (
    <div className="flex">

        {/* Image */}
        <div className="relative w-44 sm:w-52 flex-shrink-0">
          <div className="aspect-square">
            {displayImage ? (
              <Image
                src={String(displayImage)}
                alt={displayTitle}
                width={208}
                height={208}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center">
                <span className="text-muted-foreground/50 text-xs">No image</span>
              </div>
            )}
          </div>
          {/* Score badge */}
          {showScore && result.score !== undefined && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
              <span className="text-white text-xs font-medium">
                Score: {result.score.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="min-w-0">
              {/* Subtitle / Category */}
              {displaySubtitle && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {displaySubtitle}
                </p>
              )}
              {/* Title */}
              <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-foreground/80 transition-colors [&_em]:bg-yellow-100 dark:[&_em]:bg-yellow-900/50 [&_em]:text-yellow-900 dark:[&_em]:text-yellow-200 [&_em]:not-italic [&_em]:px-0.5 [&_em]:rounded">
                {titleHighlight ? (
                  <HighlightedText html={titleHighlight} />
                ) : (
                  displayTitle
                )}
              </h3>
            </div>

            {/* Price */}
            {displayPrice !== undefined && (
              <div className="flex-shrink-0 text-right">
                <p className="text-lg font-bold text-foreground">
                  {formatPrice(displayPrice)}
                </p>
              </div>
            )}
          </div>

          {/* Rating */}
          {rating !== undefined && (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i < Math.floor(rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-muted-foreground/30 fill-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-foreground/70">{rating.toFixed(1)}</span>
              {ratingCount !== undefined && (
                <span className="text-sm text-muted-foreground">({ratingCount})</span>
              )}
            </div>
          )}

          {/* Description */}
          {(displayDescription || descriptionHighlight) && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 [&_em]:bg-yellow-100 dark:[&_em]:bg-yellow-900/50 [&_em]:text-yellow-900 dark:[&_em]:text-yellow-200 [&_em]:not-italic [&_em]:px-0.5 [&_em]:rounded">
              {descriptionHighlight ? (
                <HighlightedText html={descriptionHighlight} />
              ) : (
                displayDescription
              )}
            </p>
          )}

          {/* Secondary fields */}
          {secondaryFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
              {secondaryFields.slice(0, 3).map((field) => {
                const value = getFieldValue(result.source, field.fieldName);
                if (!value) return null;
                const displayValue = String(Array.isArray(value) ? value[0] : value);
                return (
                  <span key={field.fieldName} className="flex items-center gap-1">
                    <span className="text-muted-foreground/70">{field.label}:</span>
                    <span className="font-medium text-foreground/80">{displayValue}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {badges.slice(0, 3).map((field) => {
                const value = getFieldValue(result.source, field.fieldName);
                if (!value) return null;
                const displayValue = String(Array.isArray(value) ? value[0] : value);
                return (
                  <Badge
                    key={field.fieldName}
                    variant="secondary"
                    className="bg-muted text-foreground/80 hover:bg-muted/80 text-xs font-medium"
                  >
                    {displayValue}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Hover actions */}
        <div className="hidden sm:flex flex-col items-center justify-center gap-2 pr-4 opacity-0 group-hover:opacity-100 transition-opacity">
          {onAskAI && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAskAI(result);
              }}
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:scale-105"
              title="Ask AI about this item"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>
    </div>
  );

  // Always open in new tab from demo site
  return (
    <a
      href={itemLink}
      target="_blank"
      rel="noopener noreferrer"
      className="block group bg-card rounded-2xl border border-border overflow-hidden hover:border-border/80 hover:shadow-lg transition-all duration-300"
    >
      {cardContent}
    </a>
  );
}

// ============================================================================
// GRID CARD COMPONENT
// ============================================================================

function GridResultCard({ result, displayConfig, onAskAI, forceShowScore }: DynamicResultCardProps) {
  const fields = getFieldsByRole(displayConfig);
  const badges = getAllFieldsByRole(displayConfig, 'badge').slice(0, 1);

  const title = fields.title ? getFieldValue(result.source, fields.title.fieldName) : undefined;
  const subtitle = fields.subtitle ? getFieldValue(result.source, fields.subtitle.fieldName) : undefined;
  const image = fields.image ? getFieldValue(result.source, fields.image.fieldName) : undefined;
  const price = fields.price ? getFieldValue(result.source, fields.price.fieldName) : undefined;

  const displayTitle = String(title ?? result.source.title ?? result.source.name ?? 'Untitled');
  const rawSubtitle = subtitle ?? result.source.subtitle ?? result.source.brand;
  const displaySubtitle = rawSubtitle ? String(rawSubtitle) : null;
  const displayImage = image ?? result.source.image ?? result.source.primaryImageUrl ?? result.source.imageUrl;
  const displayPrice = price ?? result.source.price ?? result.source.minPrice;

  const rating = result.source.rating as number | undefined;

  // Get item link
  const { href: itemLink } = getItemLink(result, displayConfig);

  const cardContent = (
    <>
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {displayImage ? (
          <Image
            src={String(displayImage)}
            alt={displayTitle}
            width={300}
            height={300}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center">
            <span className="text-muted-foreground/50 text-xs">No image</span>
          </div>
        )}

        {/* Hover overlay with Ask AI button */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          {onAskAI && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAskAI(result);
              }}
              className="opacity-0 group-hover:opacity-100 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-all duration-200 cursor-pointer shadow-lg hover:scale-110"
              title="Ask AI about this item"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Score badge */}
        {(forceShowScore || displayConfig?.layout?.showScore) && result.score !== undefined && (
          <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg">
            <span className="text-white text-xs font-medium">
              Score: {result.score.toFixed(2)}
            </span>
          </div>
        )}

        {/* Badge overlay */}
        {badges.length > 0 && badges.map((field) => {
          const value = getFieldValue(result.source, field.fieldName);
          if (!value) return null;
          const displayValue = String(Array.isArray(value) ? value[0] : value);
          return (
            <div
              key={field.fieldName}
              className="absolute top-3 left-3 px-2.5 py-1 bg-card/90 backdrop-blur-sm rounded-lg text-xs font-medium text-foreground/80 shadow-sm"
            >
              {displayValue}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Subtitle */}
        {displaySubtitle && (
          <p className="text-xs text-muted-foreground mb-1 truncate">{displaySubtitle}</p>
        )}

        {/* Title */}
        <h3 className="font-medium text-foreground line-clamp-2 text-sm mb-2 group-hover:text-foreground/80 transition-colors min-h-[2.5rem]">
          {displayTitle}
        </h3>

        {/* Rating */}
        {rating !== undefined && (
          <div className="flex items-center gap-1 mb-2">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-sm font-medium text-foreground/80">{rating.toFixed(1)}</span>
          </div>
        )}

        {/* Price */}
        {displayPrice !== undefined && (
          <p className="font-bold text-foreground">
            {formatPrice(displayPrice)}
          </p>
        )}
      </div>
    </>
  );

  const cardClasses = "block group bg-card rounded-2xl border border-border overflow-hidden hover:border-border/80 hover:shadow-lg transition-all duration-300";

  // Always open in new tab from demo site
  return (
    <a
      href={itemLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cardClasses}
    >
      {cardContent}
    </a>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DynamicResultCard({ result, displayConfig, viewMode = 'list', onAskAI, forceShowScore }: DynamicResultCardProps) {
  if (viewMode === 'grid') {
    return <GridResultCard result={result} displayConfig={displayConfig} onAskAI={onAskAI} forceShowScore={forceShowScore} />;
  }
  return <ListResultCard result={result} displayConfig={displayConfig} onAskAI={onAskAI} forceShowScore={forceShowScore} />;
}
