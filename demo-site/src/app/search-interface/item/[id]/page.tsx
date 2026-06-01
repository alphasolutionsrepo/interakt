'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Star, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/contexts/settings-context';
import type { DisplayConfig, DisplayField } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentDetails {
  id: string;
  fields: Record<string, unknown>;
  indexId: string;
  indexName: string;
}

interface ApiResponse {
  success: boolean;
  data?: {
    document: DocumentDetails;
    displayConfig?: DisplayConfig;
  };
  error?: string;
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

// ============================================================================
// DETAIL PAGE COMPONENT
// ============================================================================

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings, isConfigured } = useSettings();

  const [document, setDocument] = useState<DocumentDetails | null>(null);
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const documentId = params.id as string;

  useEffect(() => {
    if (!isConfigured || !documentId) {
      setIsLoading(false);
      return;
    }

    async function fetchDocument() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${settings.apiUrl}/api/v1/documents/${encodeURIComponent(documentId)}`, {
          headers: {
            'X-Access-Token': settings.accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError('Document not found');
          } else {
            setError(`Failed to fetch document: ${response.statusText}`);
          }
          return;
        }

        const data: ApiResponse = await response.json();

        if (!data.success || !data.data) {
          setError(data.error || 'Failed to fetch document');
          return;
        }

        setDocument(data.data.document);
        setDisplayConfig(data.data.displayConfig || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocument();
  }, [settings.apiUrl, settings.accessToken, documentId, isConfigured]);

  // Not configured state
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Not Configured</h1>
          <p className="text-muted-foreground mb-4">Please configure the API settings first.</p>
          <Button onClick={() => router.push('/search-interface')}>
            Go to Search
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading item details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !document) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">
              {error || 'Document not found'}
            </h1>
            <p className="text-red-600 dark:text-red-300 mb-4">
              The item you&apos;re looking for couldn&apos;t be loaded.
            </p>
            <Button onClick={() => router.push('/search-interface')}>
              Back to Search
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get field values
  const fields = getFieldsByRole(displayConfig);
  const badges = getAllFieldsByRole(displayConfig, 'badge');
  const secondaryFields = getAllFieldsByRole(displayConfig, 'secondary');

  const titleValue = fields.title ? getFieldValue(document.fields, fields.title.fieldName) : undefined;
  const title: string = String(titleValue ?? document.fields.title ?? document.fields.name ?? 'Untitled');

  const subtitleValue = fields.subtitle ? getFieldValue(document.fields, fields.subtitle.fieldName) : undefined;
  const subtitle: unknown = subtitleValue ?? document.fields.subtitle ?? document.fields.brand ?? document.fields.category;

  const descriptionValue = fields.description ? getFieldValue(document.fields, fields.description.fieldName) : undefined;
  const description = descriptionValue ?? document.fields.description ?? document.fields.shortDescription ?? document.fields.content;

  const imageValue = fields.image ? getFieldValue(document.fields, fields.image.fieldName) : undefined;
  const image = imageValue ?? document.fields.image ?? document.fields.primaryImageUrl ?? document.fields.imageUrl;

  const priceValue = fields.price ? getFieldValue(document.fields, fields.price.fieldName) : undefined;
  const price = priceValue ?? document.fields.price ?? document.fields.minPrice;

  const linkValue = fields.link ? getFieldValue(document.fields, fields.link.fieldName) : undefined;
  const externalLink = linkValue as string | undefined;

  const rating = document.fields.rating as number | undefined;
  const ratingCount = document.fields.ratingCount as number | undefined;

  // Get all fields for the "All Details" section
  const allFields = Object.entries(document.fields).filter(
    ([key]) => !key.startsWith('_') && key !== 'id'
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to results
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image Section */}
          <div className="space-y-4">
            <div className="aspect-square rounded-2xl overflow-hidden bg-muted border border-border">
              {image ? (
                <Image
                  src={String(image)}
                  alt={title}
                  width={600}
                  height={600}
                  className="w-full h-full object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-muted-foreground">No image available</span>
                </div>
              )}
            </div>
          </div>

          {/* Details Section */}
          <div className="space-y-6">
            {/* Badges */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {badges.map((field) => {
                  const value = getFieldValue(document.fields, field.fieldName);
                  if (!value) return null;
                  const displayValue: string = String(Array.isArray(value) ? value[0] : value);
                  return (
                    <Badge
                      key={field.fieldName}
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      {displayValue}
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Subtitle */}
            {subtitle != null ? (
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {String(subtitle)}
              </p>
            ) : null}

            {/* Title */}
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>

            {/* Rating */}
            {rating !== undefined && (
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(rating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-muted-foreground/30 fill-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-medium text-foreground">{rating.toFixed(1)}</span>
                {ratingCount !== undefined && (
                  <span className="text-muted-foreground">({ratingCount} reviews)</span>
                )}
              </div>
            )}

            {/* Price */}
            {price != null ? (
              <div className="text-3xl font-bold text-foreground">
                {formatPrice(price)}
              </div>
            ) : null}

            {/* Description */}
            {description != null ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  {String(description)}
                </p>
              </div>
            ) : null}

            {/* Secondary fields */}
            {secondaryFields.length > 0 && (
              <div className="border-t border-border pt-6 space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Details
                </h3>
                <dl className="grid grid-cols-2 gap-3">
                  {secondaryFields.map((field) => {
                    const value = getFieldValue(document.fields, field.fieldName);
                    if (!value) return null;
                    const displayValue = String(Array.isArray(value) ? value.join(', ') : value);
                    return (
                      <div key={field.fieldName}>
                        <dt className="text-sm text-muted-foreground">{field.label || field.fieldName}</dt>
                        <dd className="text-sm font-medium text-foreground">{displayValue}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}

            {/* External Link button */}
            {externalLink && (
              <div className="pt-4">
                <Button
                  asChild
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  <a href={externalLink} target="_blank" rel="noopener noreferrer">
                    Visit Product Page
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* All Fields Section */}
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">All Details</h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {allFields.map(([key, value], index) => (
                  <tr
                    key={key}
                    className={index % 2 === 0 ? 'bg-muted/30' : 'bg-card'}
                  >
                    <td className="px-4 py-3 font-medium text-foreground w-1/3 border-r border-border">
                      {key}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground break-words">
                      {renderFieldValue(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFieldValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">—</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground/50 italic">Empty</span>;
    }
    return value.map((item, i) => (
      <span key={i}>
        {i > 0 && ', '}
        {String(item)}
      </span>
    ));
  }

  if (typeof value === 'object') {
    return (
      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  // Check if it's a URL
  const stringValue = String(value);
  if (stringValue.startsWith('http://') || stringValue.startsWith('https://')) {
    return (
      <a
        href={stringValue}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline break-all"
      >
        {stringValue}
      </a>
    );
  }

  return stringValue;
}
