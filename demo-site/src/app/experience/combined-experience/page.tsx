'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Search,
  ArrowRight,
  ArrowUp,
  Settings,
  Sparkles,
  X,
  LayoutGrid,
  LayoutList,
  SlidersHorizontal,
  Loader2,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';

// Search components (reused from search-interface)
import { useSettings } from '@/contexts/settings-context';
import { useSearch } from '@/hooks/use-search';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { DynamicResultCard } from '../../search-interface/components/DynamicResultCard';
import { FacetSidebar } from '../../search-interface/components/FacetSidebar';
import { SettingsModal } from '../../search-interface/components/SettingsModal';

// Chat components (reused from chat)
import { useChatExperience, useWidgetConfig } from '../../chat/use-chat-experience';
import { PresetRenderer } from '../../chat/preset-renderers';
import { useChatSettings, ChatSettingsModal } from '../../chat/chat-settings';
import type { ChatExperienceMessage } from '../../chat/chat.types';

// ============================================================================
// Chat helpers
// ============================================================================

const STEP_WORDS: Record<string, string[]> = {
  'Loading context': ['Thinking', 'Analyzing', 'Reading'],
  'Planning actions': ['Planning', 'Reasoning', 'Strategizing'],
  'Executing actions': ['Searching', 'Fetching', 'Querying'],
  'Generating response': ['Writing', 'Composing', 'Crafting'],
};
const DEFAULT_WORDS = ['Thinking', 'Processing', 'Analyzing'];

function friendlyToolName(name: string): string {
  return name.replace(/\s+(Azure|Search|Index|API|Service|Tool|Query|Lookup)\s*/gi, ' ').replace(/\s+Search$/i, '').replace(/\s{2,}/g, ' ').trim();
}

function friendlyStepName(step: string): string {
  const m: Record<string, string> = { context_enrichment: 'Context enrichment', param_extraction: 'Parameter extraction', param_validation: 'Param validation', filter_validation: 'Filter validation', query_relaxation: 'Query relaxation', filter_relaxation: 'Filter relaxation', zero_result_retry: 'Retrying', tool_execution: 'Executing', result_capture: 'Capturing results' };
  return m[step] || step.replace(/_/g, ' ');
}

// Minimal markdown
function processBold(text: string, kp: string): React.ReactNode {
  if (!/\*\*.+?\*\*/.test(text)) return text;
  return <>{text.split(/(\*\*.+?\*\*)/g).map((s, j) => s.startsWith('**') && s.endsWith('**') ? <strong key={`${kp}-${j}`} className="font-semibold">{s.slice(2, -2)}</strong> : <span key={`${kp}-${j}`}>{s}</span>)}</>;
}
function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="px-1 py-0.5 rounded bg-muted text-[13px] font-mono">{p.slice(1, -1)}</code>;
    const lr = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    if (!lr.test(p)) return <span key={i}>{processBold(p, String(i))}</span>;
    lr.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let last = 0; let m: RegExpExecArray | null;
    while ((m = lr.exec(p)) !== null) { if (m.index > last) nodes.push(<span key={`${i}-${last}`}>{processBold(p.slice(last, m.index), `${i}-${last}`)}</span>); nodes.push(<a key={`${i}-l${m.index}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 decoration-foreground/40 hover:decoration-foreground">{m[1]}</a>); last = m.index + m[0].length; }
    if (last < p.length) nodes.push(<span key={`${i}-e`}>{processBold(p.slice(last), `${i}-e`)}</span>);
    return <span key={i}>{nodes}</span>;
  });
}
function renderMarkdown(text: string) {
  if (!text) return null;
  return <div className="space-y-0.5 leading-relaxed">{text.split('\n').map((line, i) => {
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) return <div key={i} className={hm[1].length === 1 ? 'text-sm font-semibold mt-2 mb-1' : 'text-xs font-semibold mt-1.5 mb-0.5'}>{inlineMarkdown(hm[2])}</div>;
    if (/^[-*]\s+/.test(line)) return <div key={i} className="flex gap-2 ml-1 text-xs"><span className="text-muted-foreground/60">•</span><span>{inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</span></div>;
    if (line.trim() === '') return <div key={i} className="h-1" />;
    return <div key={i} className="text-xs">{inlineMarkdown(line)}</div>;
  })}</div>;
}

// Animated components
function RotatingWords({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => { const t = setInterval(() => { setVisible(false); setTimeout(() => { setIndex((i) => (i + 1) % words.length); setVisible(true); }, 200); }, 2000); return () => clearInterval(t); }, [words.length]);
  return <span className="inline-block transition-all duration-300" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-3px)', minWidth: '4em' }}>{words[index]}</span>;
}

// ============================================================================
// AI Co-Pilot Panel (right side)
// ============================================================================

function CoPilotMessage({ message }: { message: ChatExperienceMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-xl rounded-br-sm bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const toolCalls = message.toolCalls ?? [];
  const actionSteps = message.actionSteps ?? [];
  const completed = toolCalls.filter(tc => tc.status === 'completed');
  const failed = toolCalls.filter(tc => tc.status === 'failed');

  return (
    <div className="space-y-1.5">
      {/* Pipeline trace — streaming */}
      {message.isStreaming && !message.content && (message.pipelineStep || toolCalls.length > 0) && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-primary/70" style={{ animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />)}
            </div>
            <span className="text-[11px] font-medium text-foreground/70">
              <RotatingWords words={message.pipelineStep ? (STEP_WORDS[message.pipelineStep] ?? DEFAULT_WORDS) : DEFAULT_WORDS} />
              <span className="text-muted-foreground/40">...</span>
            </span>
          </div>
          {toolCalls.length > 0 && <div className="w-full h-0.5 rounded-full bg-primary/10 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} /></div>}
          {completed.map(tc => (
            <div key={tc.id} className="flex items-center gap-1.5 text-[11px] pl-4 animate-fade-in">
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-muted-foreground">{friendlyToolName(tc.name)}</span>
              {tc.durationMs != null && <span className="text-muted-foreground/40">{(tc.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          ))}
          {failed.map(tc => (
            <div key={tc.id} className="flex items-center gap-1.5 text-[11px] pl-4 animate-fade-in">
              <X className="w-3 h-3 text-red-500" /><span className="text-red-500/80">{friendlyToolName(tc.name)} failed</span>
            </div>
          ))}
        </div>
      )}

      {/* Streaming with no info */}
      {message.isStreaming && !message.content && !message.pipelineStep && toolCalls.length === 0 && (
        <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/60 animate-fade-in">
          <div className="flex items-center gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-primary/70" style={{ animation: 'typing-bounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />)}</div>
          <RotatingWords words={DEFAULT_WORDS} />
        </div>
      )}

      {/* Settled trace */}
      {!message.isStreaming && (completed.length > 0 || failed.length > 0) && (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {completed.map(tc => (
              <span key={tc.id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Check className="w-2.5 h-2.5 text-emerald-500" />{friendlyToolName(tc.name)}
                {tc.durationMs != null && <span className="text-muted-foreground/40">{(tc.durationMs / 1000).toFixed(1)}s</span>}
              </span>
            ))}
            {failed.map(tc => <span key={tc.id} className="inline-flex items-center gap-1 text-[11px] text-red-500/70"><X className="w-2.5 h-2.5" />{friendlyToolName(tc.name)}</span>)}
          </div>
          {actionSteps.length > 0 && (
            <div className="pl-3 space-y-0">
              {actionSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <span className="text-muted-foreground/30">·</span>
                  {friendlyStepName(s.step)} <span className="text-muted-foreground/30">{s.durationMs}ms</span>
                  {s.detail && <span className="text-muted-foreground/40 truncate">— {s.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text content */}
      {message.content && (
        <div className="text-xs text-foreground/90">
          {renderMarkdown(message.content)}
          {message.isStreaming && <span className="inline-block w-0.5 h-3 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />}
        </div>
      )}

      {/* Presets */}
      {message.presetPayload && message.preset && (message.content || !message.isStreaming) && (
        <div className="mt-2">
          <PresetRenderer preset={message.preset} items={message.presetPayload.items} displayConfig={message.presetPayload.displayConfig} />
        </div>
      )}
    </div>
  );
}

function CoPilotPanel({ searchQuery, className }: { searchQuery: string; className?: string }) {
  const { settings: chatSettings, updateSettings: updateChatSettings, isConfigured: isChatConfigured } = useChatSettings();
  const { messages, sendMessage, isStreaming, error, clearSession } = useChatExperience({
    accessToken: chatSettings.accessToken,
    apiUrl: chatSettings.apiUrl,
  });
  const { config: widgetConfig } = useWidgetConfig({
    accessToken: chatSettings.accessToken,
    apiUrl: chatSettings.apiUrl,
  });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;
    sendMessage(text.trim());
    setInput('');
  }, [isStreaming, sendMessage]);

  // Suggested questions from widget config
  const suggestions = widgetConfig?.suggestedQuestions?.slice(0, 3) ?? [];

  if (!isChatConfigured) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center h-full px-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">AI Co-Pilot</h3>
          <p className="text-xs text-muted-foreground mb-4">Configure an AI Experience to ask questions about your search results.</p>
          <ChatSettingsModal settings={chatSettings} onSave={updateChatSettings}
            trigger={<Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs cursor-pointer"><Settings className="w-3 h-3 mr-1.5" />Configure</Button>} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="text-xs font-semibold text-foreground">{widgetConfig?.name || 'AI Co-Pilot'}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button type="button" title="New session" onClick={clearSession}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <ChatSettingsModal settings={chatSettings} onSave={updateChatSettings}
            trigger={<button type="button" title="Settings" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"><Settings className="w-3.5 h-3.5" /></button>} />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground mb-3">
              {searchQuery
                ? `Ask questions about "${searchQuery}" results`
                : 'Ask the AI about your search results'}
            </p>
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                {suggestions.map(q => (
                  <button type="button" key={q} onClick={() => handleSend(q)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-foreground/80 bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/30 hover:border-primary/20 transition-all cursor-pointer">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map(msg => <CoPilotMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 shrink-0">
          <div className="text-[11px] text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1">{error}</div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/50 px-3 py-2.5 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
            placeholder={searchQuery ? `Ask about "${searchQuery}"...` : 'Ask a question...'}
            disabled={isStreaming}
            className="w-full h-9 pl-3 pr-9 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition-all disabled:opacity-50"
          />
          <button type="button" onClick={() => handleSend(input)} disabled={isStreaming || !input.trim()}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
            {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function PossibilitiesPage() {
  const { isConfigured, settings } = useSettings();
  const {
    query, results, facets, pagination, displayConfig,
    isLoading, error, selectedFacets, took, indexesSearched,
    search, setPage, toggleFacet, clearFacets,
  } = useSearch();

  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showCoPilot, setShowCoPilot] = useState(true);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { suggestions, fetchSuggestions, clearSuggestions } = useAutocomplete(150);
  const hasResults = results.length > 0 || (query && pagination);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) { search(searchInput.trim()); setShowAutocomplete(false); clearSuggestions(); }
  }, [searchInput, search, clearSuggestions]);

  const handleQuickSearch = useCallback((q: string) => {
    setSearchInput(q); search(q);
  }, [search]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setSearchInput(v); setSelectedSuggestionIndex(-1);
    if (v.trim().length >= 2) { fetchSuggestions(v); setShowAutocomplete(true); }
    else { clearSuggestions(); setShowAutocomplete(false); }
  }, [fetchSuggestions, clearSuggestions]);

  const handleSuggestionSelect = useCallback((text: string) => {
    setSearchInput(text); search(text); setShowAutocomplete(false); clearSuggestions(); setSelectedSuggestionIndex(-1);
  }, [search, clearSuggestions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSuggestionIndex(p => p < suggestions.length - 1 ? p + 1 : p); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSuggestionIndex(p => p > 0 ? p - 1 : -1); }
    else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) { e.preventDefault(); handleSuggestionSelect(suggestions[selectedSuggestionIndex].text); }
    else if (e.key === 'Escape') { setShowAutocomplete(false); setSelectedSuggestionIndex(-1); }
  }, [showAutocomplete, suggestions, selectedSuggestionIndex, handleSuggestionSelect]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) setShowAutocomplete(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const facetsObject = facets.reduce((acc, f) => {
    acc[f.field] = { field: f.field, type: f.type, buckets: f.buckets.map(b => ({ key: String(b.key), count: b.count })) };
    return acc;
  }, {} as Record<string, { field: string; type: string; buckets: { key: string; count: number }[] }>);

  const handleFacetChange = (facetKey: string, values: string[]) => {
    const cur = selectedFacets[facetKey] || [];
    for (const v of values) { if (!cur.includes(v)) toggleFacet(facetKey, v); }
    for (const v of cur) { if (!values.includes(v)) toggleFacet(facetKey, v); }
  };

  const getTotalSelected = () => Object.values(selectedFacets).reduce((s, a) => s + a.length, 0);

  const getFacetDisplayName = (f: string) => {
    const m: Record<string, string> = { brand: 'Brand', categories: 'Categories', category: 'Category', availability: 'Availability', priceRange: 'Price Range', colors: 'Colors', primaryColor: 'Color', materials: 'Materials', material: 'Material', size: 'Size', type: 'Type', gender: 'Gender', style: 'Style' };
    return m[f] || f.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  };

  // Example queries from settings
  const exampleQueries = settings.exampleQueries ?? [];

  if (!isConfigured) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 opacity-50" />
        <div className="absolute inset-0" />
        <div className="relative max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-6 shadow-lg">
            <Search className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Configure Search</h1>
          <p className="text-muted-foreground mb-6">Connect your API to explore the AI-powered search experience.</p>
          <div className="bg-card rounded-2xl border border-border shadow-xl p-6">
            <SettingsModal />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ================================================================ */}
      {/* LEFT: Search Area */}
      {/* ================================================================ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className={`shrink-0 transition-all duration-500 ${hasResults ? 'py-3 border-b border-border/50' : 'py-16 md:py-24'}`}>
          {!hasResults && (
            <div className="absolute inset-0 opacity-30 pointer-events-none" />
          )}
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
            {!hasResults && (
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3">
                  <span className="text-foreground">Experience </span>
                  <span className="">Intelligent Search</span>
                </h1>
                <p className="text-base text-muted-foreground max-w-xl mx-auto">
                  Search naturally and watch the AI understand your intent — with a co-pilot that explains what&apos;s happening.
                </p>
              </div>
            )}

            <form onSubmit={handleSearch} className="relative z-20 mx-auto max-w-3xl">
              <div ref={searchContainerRef} className="relative">
                <div className={`absolute inset-0 bg-card border border-border ${showAutocomplete && suggestions.length > 0 ? 'rounded-t-2xl' : 'rounded-full'} shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]`} />
                <div className={`relative flex items-center ${hasResults ? 'h-12' : 'h-14 md:h-16'}`}>
                  <div className="flex items-center justify-center pl-5 pr-2">
                    <Search className={`text-muted-foreground ${hasResults ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  </div>
                  <input ref={inputRef} type="text" placeholder="Search for anything..." value={searchInput}
                    onChange={handleInputChange} onKeyDown={handleKeyDown} autoComplete="off"
                    onFocus={() => { if (searchInput.trim().length >= 2 && suggestions.length > 0) setShowAutocomplete(true); }}
                    className={`flex-1 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground font-semibold tracking-tight ${hasResults ? 'text-base pr-32' : 'text-lg md:text-xl pr-36 md:pr-40'}`} />
                  <div className={`shrink-0 ${hasResults ? 'pr-1.5' : 'pr-2'}`}>
                    <Button type="submit" disabled={isLoading} className={`bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-all cursor-pointer ${hasResults ? 'h-9 px-5 text-sm' : 'h-10 md:h-12 px-6 md:px-7 text-sm md:text-base'}`}>
                      {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Searching</> : <>Search <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                    </Button>
                  </div>
                </div>

                {/* Autocomplete */}
                {showAutocomplete && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-[100] bg-card/95 backdrop-blur-xl border-x border-b border-border rounded-b-2xl overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]">
                    <div className="border-t border-border/50 mx-4" />
                    <ul className="py-2">
                      {suggestions.map((s, i) => (
                        <li key={s.text}>
                          <button type="button" onClick={() => handleSuggestionSelect(s.text)}
                            className={`w-full px-5 py-2.5 text-left flex items-center gap-3 transition-all cursor-pointer ${i === selectedSuggestionIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}>
                            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-foreground text-sm font-medium truncate">{s.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Example queries + settings on landing */}
              {!hasResults && (
                <div className="flex flex-col items-center mt-6 gap-4">
                  {exampleQueries.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      <span className="text-sm text-muted-foreground self-center mr-1">Try:</span>
                      {exampleQueries.map(q => (
                        <button type="button" key={q} onClick={() => handleQuickSearch(q)}
                          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium bg-card/80 text-foreground border border-border/50 hover:border-primary/30 hover:bg-primary/10 hover:text-primary transition-all cursor-pointer">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <SettingsModal />
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Results area */}
        {hasResults && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-6">
              {/* Stats bar */}
              {query && pagination && (
                <div className="space-y-2 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm text-muted-foreground font-medium">
                        <span className="font-bold text-foreground">{pagination.totalItems.toLocaleString()}</span> results for <span className="font-bold text-foreground">&ldquo;{query}&rdquo;</span>
                        {took > 0 && <span className="text-muted-foreground/70 ml-1.5">in {took}ms</span>}
                      </p>
                      {indexesSearched.length > 0 && indexesSearched.map(idx => (
                        <span key={idx.id} className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{idx.displayName || idx.name}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowMobileFilters(!showMobileFilters)} className="lg:hidden h-8 px-3 rounded-lg text-xs">
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />Filters
                      </Button>
                      <div className="flex items-center bg-muted rounded-lg p-0.5">
                        <button type="button" title="List view" onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><LayoutList className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Grid view" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
                      </div>
                      <button type="button" title={showCoPilot ? 'Hide AI Co-Pilot' : 'Show AI Co-Pilot'}
                        onClick={() => setShowCoPilot(!showCoPilot)}
                        className={`p-1.5 rounded-md transition-all cursor-pointer lg:inline-flex hidden ${showCoPilot ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                        {showCoPilot ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                      </button>
                      <SettingsModal />
                    </div>
                  </div>

                  {/* Active filter breadcrumbs */}
                  {getTotalSelected() > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-muted-foreground">Filtered by:</span>
                      {Object.entries(selectedFacets).flatMap(([field, values]) =>
                        values.map(v => (
                          <button type="button" key={`${field}-${v}`} onClick={() => toggleFacet(field, v)}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer">
                            <span className="text-primary/60">{getFacetDisplayName(field)}:</span>{v}<X className="w-2.5 h-2.5" />
                          </button>
                        ))
                      )}
                      <button type="button" onClick={clearFacets} className="text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer ml-1">Clear all</button>
                    </div>
                  )}
                </div>
              )}

              {/* Results + facets */}
              <div className="flex gap-6 lg:gap-8">
                {/* Facet sidebar */}
                <aside className={`${showMobileFilters ? 'fixed inset-0 z-50 bg-black/50 lg:relative lg:bg-transparent' : 'hidden lg:block'} w-56 shrink-0`}>
                  <div className={`${showMobileFilters ? 'absolute right-0 top-0 h-full w-72 bg-card shadow-xl overflow-hidden' : 'sticky top-4'} lg:relative lg:w-full lg:shadow-none`}>
                    {showMobileFilters && (
                      <div className="flex items-center justify-between p-3 border-b lg:hidden">
                        <h2 className="text-sm font-bold">Filters</h2>
                        <button type="button" title="Close filters" onClick={() => setShowMobileFilters(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                    <div className={showMobileFilters ? 'p-3 overflow-y-auto h-[calc(100%-48px)]' : ''}>
                      <FacetSidebar facets={facetsObject} selectedFacets={selectedFacets} onFacetChange={handleFacetChange} onClearAll={clearFacets} isLoading={isLoading} />
                    </div>
                  </div>
                </aside>

                {/* Results */}
                <main className="flex-1 min-w-0">
                  {isLoading && results.length === 0 && (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-3' : 'space-y-3'}>
                      {[...Array(viewMode === 'grid' ? 6 : 3)].map((_, i) => (
                        <div key={i} className="animate-pulse"><div className={`bg-muted rounded-xl ${viewMode === 'grid' ? 'aspect-[3/4]' : 'h-32'}`} /></div>
                      ))}
                    </div>
                  )}
                  {!isLoading && query && results.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Search className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-base font-medium text-foreground mb-1">No results found</h3>
                      <p className="text-sm text-muted-foreground">Try different keywords or remove some filters.</p>
                    </div>
                  )}
                  {results.length > 0 && (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-3' : 'space-y-3'}>
                      {results.map(r => <DynamicResultCard key={r.id} result={r} displayConfig={displayConfig} viewMode={viewMode} />)}
                    </div>
                  )}

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setPage(pagination.page - 1)} disabled={!pagination.hasPreviousPage || isLoading} className="h-9 px-3 rounded-lg border-border cursor-pointer">
                        <ChevronLeft className="w-4 h-4 mr-1" />Prev
                      </Button>
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        const start = Math.max(1, pagination.page - 2);
                        const pn = start + i;
                        if (pn > pagination.totalPages) return null;
                        return (
                          <button type="button" key={pn} onClick={() => setPage(pn)} disabled={isLoading}
                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-all cursor-pointer ${pn === pagination.page ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>{pn}</button>
                        );
                      }).filter(Boolean)}
                      <Button variant="outline" size="sm" onClick={() => setPage(pagination.page + 1)} disabled={!pagination.hasNextPage || isLoading} className="h-9 px-3 rounded-lg border-border cursor-pointer">
                        Next<ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </main>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-2 shrink-0">
            <div className="max-w-4xl mx-auto text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error.message}</div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* RIGHT: AI Co-Pilot Panel */}
      {/* ================================================================ */}
      {showCoPilot && (
        <CoPilotPanel
          searchQuery={query}
          className="hidden lg:flex w-80 xl:w-96 border-l border-border/50 bg-card/50"
        />
      )}
    </div>
  );
}
