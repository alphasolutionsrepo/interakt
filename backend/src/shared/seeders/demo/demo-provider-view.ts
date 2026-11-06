// src/shared/seeders/demo/demo-provider-view.ts
//
// How the Demo Setup status describes each AI provider the demo can use: written by
// the setup-demo route, read by the setup page.
//
// IMPORTANT: this module must stay free of `server-only` and any server-only
// imports — the client page imports it directly.

import type { DemoProviderOption } from './demo-manifest';

export interface ProviderReadinessView {
  key: string;
  label: string;
  tagline?: string;
  authType: 'none' | 'api_key';
  requiredModels: string[];
  defaultBaseUrl?: string;
  defaults: DemoProviderOption['defaults'];
  inCatalog: boolean;
  ready: boolean;
  // api_key providers
  hasStoredKey?: boolean;
  // local providers (ollama)
  baseUrl?: string;
  reachable?: boolean;
  pulledModels?: string[];
  // Pulled models split by role — the Demo Setup page offers these in the chat
  // and embedding pickers. (Chat = everything that doesn't look like an embedder.)
  pulledChatModels?: string[];
  pulledEmbeddingModels?: string[];
  missingModels?: string[];
}
