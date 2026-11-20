// src/app/ai-providers/_lib/key-source.test.ts

import { describe, expect, it } from 'vitest';

import { chosenSecretOf, initialKeySource, keyFieldsToSend, keyLocation, providerEditLock, typedKeyMissing } from './key-source';

const own = { apiKeySecret: 'ai_provider_gw', apiKeySecretManaged: true, baseUrl: 'https://a.example/v1' };
const chosen = { apiKeySecret: 'shared_key', apiKeySecretManaged: false, baseUrl: 'https://a.example/v1' };

describe('where the form takes a provider\'s key from', () => {
  it('opens on "vault secret" only for a secret the admin chose', () => {
    expect(initialKeySource(null)).toBe('typed');
    expect(initialKeySource(own)).toBe('typed');
    expect(initialKeySource(chosen)).toBe('secret');
    expect(chosenSecretOf(own)).toBe('');
    expect(chosenSecretOf(chosen)).toBe('shared_key');
  });

  it('sends a typed key, empty to keep the saved one, and never a secret name with it', () => {
    expect(keyFieldsToSend({ source: 'typed', apiKey: 'sk-1', apiKeySecret: 'shared_key', baseUrl: own.baseUrl, provider: own })).toEqual({ apiKey: 'sk-1' });
    expect(keyFieldsToSend({ source: 'typed', apiKey: '', baseUrl: own.baseUrl, provider: own })).toEqual({ apiKey: '' });
  });

  it('sends a chosen secret when new or changed, and again when the base URL changed; nothing otherwise', () => {
    expect(keyFieldsToSend({ source: 'secret', apiKeySecret: 'shared_key', baseUrl: 'https://a.example/v1' })).toEqual({ apiKeySecret: 'shared_key' });
    expect(keyFieldsToSend({ source: 'secret', apiKeySecret: 'other_key', baseUrl: chosen.baseUrl, provider: chosen })).toEqual({ apiKeySecret: 'other_key' });
    expect(keyFieldsToSend({ source: 'secret', apiKeySecret: 'shared_key', baseUrl: 'https://b.example/v1', provider: chosen })).toEqual({ apiKeySecret: 'shared_key' });
    expect(keyFieldsToSend({ source: 'secret', apiKeySecret: 'shared_key', baseUrl: chosen.baseUrl, provider: chosen })).toEqual({});
    expect(keyFieldsToSend({ source: 'secret', apiKeySecret: '', baseUrl: chosen.baseUrl, provider: chosen })).toEqual({});
  });
});

describe('where the card says a provider\'s key is kept', () => {
  it('names the vault secret, says a key not yet moved will move, and says nothing with no key', () => {
    expect(keyLocation({ hasApiKey: true, apiKeySecret: 'ai_provider_gw' })).toBe('Kept in the Secrets Vault as ai_provider_gw');
    expect(keyLocation({ hasApiKey: true, apiKeySecret: null })).toMatch(/moves to the Secrets Vault/);
    expect(keyLocation({ hasApiKey: false, apiKeySecret: null })).toBeNull();
  });
});

describe('switching from a chosen vault secret to a key entered here', () => {
  it('needs a key, so an empty field never quietly keeps the secret', () => {
    expect(typedKeyMissing({ source: 'typed', apiKey: '', provider: chosen })).toBe(true);
    expect(typedKeyMissing({ source: 'typed', apiKey: 'sk-new', provider: chosen })).toBe(false);
    // The provider's own secret (from a typed key) is kept by an empty field, as before
    expect(typedKeyMissing({ source: 'typed', apiKey: '', provider: own })).toBe(false);
    expect(typedKeyMissing({ source: 'secret', apiKey: '', provider: chosen })).toBe(false);
  });
});

describe('when a provider is locked for a user', () => {
  it('locks one using a chosen vault secret for a role that cannot manage secrets, naming the secret and the permission', () => {
    const note = providerEditLock(chosen, false);
    expect(note).toContain('"shared_key"');
    expect(note).toContain('Manage secrets and ingestion keys');
  });

  it('is open with the permission', () => {
    expect(providerEditLock(chosen, true)).toBeNull();
  });

  it('is open for a provider whose secret came from its own typed key', () => {
    expect(providerEditLock(own, false)).toBeNull();
  });

  it('is open for a provider with no secret, and for a new provider', () => {
    expect(providerEditLock({ apiKeySecret: null, apiKeySecretManaged: false, baseUrl: 'https://a.example/v1' }, false)).toBeNull();
    expect(providerEditLock(null, false)).toBeNull();
    expect(providerEditLock(undefined, false)).toBeNull();
  });
});
