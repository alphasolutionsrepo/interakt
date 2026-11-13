// app/tools/_components/ToolTestPanel.tsx

'use client';

import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { useState } from 'react';

import { toolsApi, type ToolTestResult } from '../_lib/api-client';

import { useAreaGate } from '@/app/playground/_lib/area-gate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ActionButton, useActionGate } from '@/shared/access/ActionControls';
import { errorText } from '@/shared/api/api-error';

/** Run a tool with test input; Run is locked with the reason for a role that can't test (it calls the tool). */
export function ToolTestPanel({ toolId, isActive, executorType, operation }: {
  toolId: string;
  isActive: boolean;
  executorType: string;
  operation?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolTestResult | null>(null);

  // Build the correct input object based on operation type
  function buildInput(): Record<string, unknown> | null {
    if (executorType === 'data_source') {
      if (operation === 'inspect') return {};
      if (operation === 'enumerate') {
        if (!fieldName.trim()) return null;
        return { field: fieldName.trim() };
      }
      if (operation === 'lookup') {
        if (!lookupId.trim()) return null;
        return { id: lookupId.trim() };
      }
      // search (default)
      if (!query.trim()) return null;
      return { query: query.trim() };
    }
    if (executorType === 'ai_call') {
      if (!query.trim()) return null;
      return { input: query.trim() };
    }
    if (!query.trim()) return null;
    return { query: query.trim() };
  }

  // A test run calls the tool for real: playground:use
  // and the Playground area on (every Test button is locked with the reason when it is off)
  const runGate = useAreaGate(useActionGate('tools.test'), 'playground');
  const canRun = isActive && !running && (() => {
    if (!isActive) return false;
    if (operation === 'inspect') return true;
    if (operation === 'enumerate') return !!fieldName.trim();
    if (operation === 'lookup') return !!lookupId.trim();
    return !!query.trim();
  })();

  async function handleRun() {
    const input = buildInput();
    // Enter in the inputs runs it too, so the lock is checked here as well as on the button
    if (input === null || running || runGate.state !== 'allowed') return;
    setRunning(true);
    setResult(null);
    try {
      setResult(await toolsApi.test(toolId, input));
    } catch (err) {
      setResult({ success: false, error: errorText(err, 'The test run failed'), durationMs: 0 });
    } finally {
      setRunning(false);
    }
  }

  const runButton = (
    <ActionButton
      gate={runGate}
      icon={running ? Loader2 : Play}
      iconClassName={running ? 'size-4 mr-2 animate-spin' : 'size-4 mr-2'}
      className="rounded-xl shrink-0"
      onClick={handleRun}
      disabled={!canRun}
    >
      {running ? 'Running…' : 'Run'}
    </ActionButton>
  );

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FlaskConical className="size-4 text-amber-500" />
          Test Tool
        </CardTitle>
        <CardDescription>
          Run a live query to verify this tool is configured correctly.
          {!isActive && <span className="text-amber-500 ml-1">— Tool must be active to test.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input — varies by operation type */}
        {operation === 'inspect' ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground italic">No input required — returns the full schema.</p>
            {runButton}
          </div>
        ) : operation === 'enumerate' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
                placeholder="Field name to enumerate, e.g. category, brand, size…"
                className="rounded-xl font-mono text-sm"
                disabled={!isActive || running}
              />
              {runButton}
            </div>
            <p className="text-xs text-muted-foreground">Enter the exact field name whose distinct values you want to list.</p>
          </div>
        ) : operation === 'lookup' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
                placeholder="Document ID to look up…"
                className="rounded-xl font-mono text-sm"
                disabled={!isActive || running}
              />
              {runButton}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
              placeholder={executorType === 'ai_call' ? 'Enter a prompt or question…' : 'Enter a search query…'}
              className="rounded-xl font-mono text-sm"
              disabled={!isActive || running}
            />
            {runButton}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            {/* Status bar */}
            <div className="flex items-center gap-3 text-sm">
              {result.success ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="size-4" />Success
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-destructive font-medium">
                  <XCircle className="size-4" />Error
                </span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="size-3" />{result.durationMs}ms
              </span>
            </div>

            {/* Error message */}
            {!result.success && result.error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive font-mono">
                {result.error}
              </div>
            )}

            {/* Response JSON */}
            {result.success && result.data !== undefined && (
              <pre className="text-xs font-mono bg-muted/60 border border-border/60 p-4 rounded-xl overflow-auto max-h-96 leading-relaxed">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
