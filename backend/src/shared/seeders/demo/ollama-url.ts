// src/shared/seeders/demo/ollama-url.ts

/** Ollama on the machine (or the Docker host) the server runs on */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'] as const;

/**
 * The URL Demo Setup may call to check an Ollama URL an admin typed: one already
 * configured (saved on the provider, set in the environment, the manifest default), or
 * Ollama on this machine. It is built here, not taken as typed, so a request can't send
 * the server to any other host (request forgery). Another host is checked once it is
 * configured. Undefined when the URL isn't one of these.
 */
export function trustedOllamaUrl(typed: string, configured: Array<string | undefined>): string | undefined {
  const url = parse(typed);
  if (!url) return undefined;

  const known = configured.find((c) => c && parse(c)?.origin === url.origin);
  if (known) return known;

  const host = LOCAL_HOSTS.find((h) => h === url.hostname);
  if (!host) return undefined;
  const port = url.port ? `:${Number(url.port)}` : '';
  return `${url.protocol === 'https:' ? 'https' : 'http'}://${host}${port}`;
}

/** An http(s) URL without credentials in it */
function parse(text: string): URL | undefined {
  try {
    const url = new URL(text.trim());
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    return web && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}
