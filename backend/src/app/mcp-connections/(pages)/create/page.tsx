'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cpu, Plus, ChevronRight, ArrowLeft, Server, Key, Loader2 } from 'lucide-react';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateMcpConnection } from '../../_lib/hooks/useMcpConnections';
import type { McpAuthType, McpTransport } from '../../_lib/api-client';

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

const PRESETS = [
  {
    label: 'DeepWiki (GitHub docs)',
    description: 'No auth · 3 tools · public',
    url: 'https://mcp.deepwiki.com/mcp',
    transport: 'streamable-http' as McpTransport,
  },
  {
    label: 'Context7 (library docs)',
    description: 'No auth · public',
    url: 'https://mcp.context7.com/mcp',
    transport: 'streamable-http' as McpTransport,
  },
  {
    label: 'GitMCP (any GitHub repo)',
    description: 'No auth · public',
    url: 'https://gitmcp.io/docs',
    transport: 'streamable-http' as McpTransport,
  },
];

export default function CreateMcpConnectionPage() {
  const router = useRouter();
  const createMutation = useCreateMcpConnection();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [transport, setTransport] = useState<McpTransport>('streamable-http');
  const [authType, setAuthType] = useState<McpAuthType>('none');
  const [secretRef, setSecretRef] = useState('');
  const [headerName, setHeaderName] = useState('');

  function applyPreset(p: typeof PRESETS[number]) {
    setName(p.label);
    setSlug(generateSlug(p.label));
    setServerUrl(p.url);
    setTransport(p.transport);
    setAuthType('none');
  }

  function handleNameChange(v: string) {
    setName(v);
    setSlug(generateSlug(v));
  }

  const isValid =
    name.trim().length > 0 &&
    slug.length >= 3 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    /^https?:\/\//.test(serverUrl) &&
    (authType === 'none' ||
      (authType === 'bearer' && secretRef.trim().length > 0) ||
      (authType === 'header' && secretRef.trim().length > 0 && headerName.trim().length > 0));

  async function handleCreate() {
    if (!isValid) return;
    const authConfig =
      authType === 'none'
        ? { type: 'none' as const }
        : authType === 'bearer'
          ? { type: 'bearer' as const, secretRef }
          : { type: 'header' as const, secretRef, headerName };

    try {
      const created = await createMutation.mutateAsync({
        name,
        slug,
        description: description || undefined,
        serverUrl,
        transport,
        authConfig,
      });
      router.push(`/mcp-connections/${created.id}`);
    } catch {
      // toast handled in hook
    }
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8 max-w-4xl">
      <PageHeader
        variant="detail"
        title="Create MCP Connection"
        description="Connect a Model Context Protocol server. We'll auto-discover its tool catalog on save."
        breadcrumb={
          <>
            <Link href="/mcp-connections" className="hover:text-foreground transition-colors font-medium">
              MCP Connections
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">Create</span>
          </>
        }
        customIcon={
          <div className="relative">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 via-indigo-500/10 to-transparent ring-1 ring-indigo-500/30 shadow-sm">
              <Cpu className="size-6 text-indigo-500" />
            </div>
            <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-primary ring-2 ring-background">
              <Plus className="size-3 text-white" />
            </div>
          </div>
        }
      />

      {/* Quick presets */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold">Try a public MCP server</h3>
          <p className="text-sm text-muted-foreground">
            Free, no auth required. Useful for testing the wiring before connecting your own.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-left rounded-xl border border-border/50 bg-muted/30 p-4 hover:border-primary hover:bg-muted/50 transition-colors"
            >
              <p className="font-semibold text-sm">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              <p className="text-xs font-mono text-muted-foreground/80 mt-2 truncate">{p.url}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Identity */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold">Identity</h3>
          <p className="text-sm text-muted-foreground">How this connection is referenced internally.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="e.g. Atlassian Jira, DeepWiki"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            placeholder="my-mcp-connection"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className="h-11 rounded-xl font-mono"
          />
          <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="What does this connection provide?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl"
            rows={2}
          />
        </div>
      </section>

      {/* Connection */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Server className="size-4" /> Server
          </h3>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serverUrl">Server URL</Label>
          <Input
            id="serverUrl"
            placeholder="https://example.com/mcp"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="h-11 rounded-xl font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transport">Transport</Label>
          <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
            <SelectTrigger id="transport" className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="streamable-http">Streamable HTTP (recommended)</SelectItem>
              <SelectItem value="sse">SSE (legacy)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Auth */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Key className="size-4" /> Authentication
          </h3>
          <p className="text-sm text-muted-foreground">
            Bearer/header tokens reference an existing entry in the Secrets vault.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="authType">Auth type</Label>
          <Select value={authType} onValueChange={(v) => setAuthType(v as McpAuthType)}>
            <SelectTrigger id="authType" className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="bearer">Bearer token</SelectItem>
              <SelectItem value="header">Custom header</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {authType !== 'none' && (
          <div className="space-y-2">
            <Label htmlFor="secretRef">Secret reference</Label>
            <Input
              id="secretRef"
              placeholder="my_mcp_token"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              className="h-11 rounded-xl font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Name of the secret stored in the Secrets vault. The token value is resolved at runtime.
            </p>
          </div>
        )}
        {authType === 'header' && (
          <div className="space-y-2">
            <Label htmlFor="headerName">Header name</Label>
            <Input
              id="headerName"
              placeholder="X-API-Key"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => router.push('/mcp-connections')}
          className="rounded-xl"
        >
          <ArrowLeft className="mr-1.5 size-4" /> Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!isValid || createMutation.isPending}
          size="lg"
          className="rounded-xl px-8 font-bold"
        >
          {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Create & discover tools
        </Button>
      </div>
    </div>
  );
}
