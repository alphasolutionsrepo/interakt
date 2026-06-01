'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  Loader2,
  AlertCircle,
  ExternalLink,
  ImageIcon,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatSettings, ChatSettingsModal } from '../../chat-settings';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentDetails {
  id: string;
  fields: Record<string, unknown>;
  indexId: string;
  indexName: string;
}

interface DisplayField {
  fieldName: string;
  role: string;
  label?: string;
  order: number;
}

interface DisplayConfig {
  displayFields: DisplayField[];
  layout?: {
    showScore?: boolean;
    showHighlights?: boolean;
  };
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
// HELPERS
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

function prettifyKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ============================================================================
// FIELD VALUE RENDERER
// ============================================================================

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/40 italic">—</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${value ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-sm">{value.toLocaleString()}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground/40 italic">Empty</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <span
            key={i}
            className="inline-block text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-40 font-mono border border-border/50">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const stringValue = String(value);

  // URL
  if (stringValue.startsWith('http://') || stringValue.startsWith('https://')) {
    // Image URL
    if (/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(stringValue)) {
      return (
        <div className="space-y-2">
          <img
            src={stringValue}
            alt=""
            className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <a
            href={stringValue}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {stringValue}
          </a>
        </div>
      );
    }
    return (
      <a
        href={stringValue}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline break-all text-sm"
      >
        {stringValue}
      </a>
    );
  }

  // Long text
  if (stringValue.length > 200) {
    return <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{stringValue}</p>;
  }

  return <span className="text-sm">{stringValue}</span>;
}

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title="Copy ID"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ============================================================================
// DOCUMENT DETAIL PAGE
// ============================================================================

export default function ChatDocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings, updateSettings, isConfigured, isHydrated } = useChatSettings();

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
        const apiUrl = settings.apiUrl.replace(/\/+$/, '');
        const response = await fetch(
          `${apiUrl}/api/v1/documents/${encodeURIComponent(documentId)}`,
          {
            headers: {
              'X-Access-Token': settings.accessToken,
              'Content-Type': 'application/json',
            },
          },
        );

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

  // Hydrating
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Not configured
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/30">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-sm px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Settings className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Configure Connection</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Set up your API connection to view document details.
            </p>
            <ChatSettingsModal
              settings={settings}
              onSave={updateSettings}
              trigger={
                <Button className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-6">
                  <Settings className="w-4 h-4 mr-2" />
                  Configure
                </Button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/30">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="relative w-12 h-12 mx-auto mb-4">
              <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand animate-spin" />
              <span className="absolute inset-[8px] rounded-full bg-primary/80" />
            </div>
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error || !document) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-6 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
              {error || 'Document not found'}
            </h1>
            <p className="text-sm text-red-600 dark:text-red-300 mb-6">
              The document you&apos;re looking for couldn&apos;t be loaded.
            </p>
            <Link href="/chat">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Back to Chat
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resolve display fields
  const fields = getFieldsByRole(displayConfig);
  const badges = getAllFieldsByRole(displayConfig, 'badge');
  const secondaryFields = getAllFieldsByRole(displayConfig, 'secondary');

  const titleValue = fields.title ? getFieldValue(document.fields, fields.title.fieldName) : undefined;
  const title = String(titleValue ?? document.fields.title ?? document.fields.name ?? 'Untitled');

  const subtitleValue = fields.subtitle ? getFieldValue(document.fields, fields.subtitle.fieldName) : undefined;
  const subtitle = subtitleValue ?? document.fields.subtitle ?? document.fields.brand ?? document.fields.category;

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

  // All fields for the details table
  const allFields = Object.entries(document.fields).filter(
    ([key]) => !key.startsWith('_') && key !== 'id',
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/30">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-[11px]">
              {document.id}
            </span>
            <CopyButton text={document.id} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Image */}
          <div className="lg:col-span-2">
            <div className="sticky top-20">
              <div className="aspect-square rounded-2xl overflow-hidden bg-card border border-border/50 shadow-sm">
                {image ? (
                  <img
                    src={String(image)}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center ${image ? 'hidden' : ''}`}>
                  <ImageIcon className="w-16 h-16 text-muted-foreground/15" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Details */}
          <div className="lg:col-span-3 space-y-6">
            {/* Badges */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {badges.map((field) => {
                  const value = getFieldValue(document.fields, field.fieldName);
                  if (!value) return null;
                  const displayValue = String(Array.isArray(value) ? value[0] : value);
                  return (
                    <span
                      key={field.fieldName}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                    >
                      {displayValue}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Subtitle */}
            {subtitle != null && (
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {String(subtitle)}
              </p>
            )}

            {/* Title */}
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{title}</h1>

            {/* Rating */}
            {rating !== undefined && (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(rating)
                          ? 'text-amber-400 fill-amber-400'
                          : i < rating
                            ? 'text-amber-400 fill-amber-400/50'
                            : 'text-muted-foreground/20'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold text-foreground">{rating.toFixed(1)}</span>
                {ratingCount !== undefined && (
                  <span className="text-sm text-muted-foreground">({ratingCount.toLocaleString()} reviews)</span>
                )}
              </div>
            )}

            {/* Price */}
            {price != null && (
              <div className="text-3xl font-bold text-foreground">
                {formatPrice(price)}
              </div>
            )}

            {/* Description */}
            {description != null && (
              <div className="bg-card/50 rounded-xl border border-border/50 p-4">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {String(description)}
                </p>
              </div>
            )}

            {/* Secondary fields */}
            {secondaryFields.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {secondaryFields.map((field) => {
                    const value = getFieldValue(document.fields, field.fieldName);
                    if (!value) return null;
                    const displayValue = String(Array.isArray(value) ? value.join(', ') : value);
                    return (
                      <div key={field.fieldName} className="bg-card/50 rounded-lg border border-border/50 p-3">
                        <dt className="text-xs text-muted-foreground mb-0.5">{field.label || prettifyKey(field.fieldName)}</dt>
                        <dd className="text-sm font-medium text-foreground">{displayValue}</dd>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* External Link */}
            {externalLink && (
              <a
                href={externalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium shadow-md transition-all"
              >
                Visit Product Page
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* All Fields Table */}
        {allFields.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-lg font-bold text-foreground">All Fields</h2>
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
              <div className="divide-y divide-border/50">
                {allFields.map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-3 gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-1">
                      <span className="text-sm font-medium text-foreground">
                        {prettifyKey(key)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <FieldValue value={value} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
