# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull
requests, or discussions.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Provide a description, reproduction steps, affected version/commit, and the
   impact you've identified.

This routes the report privately to the maintainers. If you're unable to use that
channel, email the maintainers at **interakt@alpha-solutions.us** to arrange a
private disclosure.

Please include enough detail to reproduce and assess the issue — ideally a minimal
proof of concept, the affected endpoint or component, and any relevant configuration.

## What to expect

- We aim to acknowledge a report within a few business days.
- We'll confirm the issue, determine its severity, and keep you updated on remediation.
- We follow coordinated disclosure: please give us a reasonable window to ship a fix
  before any public disclosure. We're happy to credit reporters who'd like acknowledgement.

## Supported versions

Interakt is in active early development (0.x). Security fixes are applied to the latest
`main`; there are no long-term support branches for older revisions yet.

## Scope and hardening notes

When self-hosting, a few configuration items materially affect your security posture —
these are your responsibility to set correctly, not defaults to ship to production as-is:

- **Secrets.** `SECRETS_ENCRYPTION_KEY`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, and all provider
  API keys must be strong, unique, and kept out of version control. `.env*` is gitignored;
  keep it that way. The secrets vault, which also holds AI provider API keys, encrypts
  stored credentials with AES-256-GCM using `SECRETS_ENCRYPTION_KEY` — protect that key
  accordingly. Keep a backup of it: with a lost or changed key, every AI provider that uses
  an API key, and every tool, MCP connection and data source secret, stops working until its
  secret is entered again.
- **Admin credentials.** Change the default admin email/password in
  `setup/setup.config.yaml` before exposing an instance.
- **Public experience APIs** (`/api/v1/...`) are gated by per-experience access tokens with
  configurable CORS origins and rate limiting. Set explicit `allowedOrigins` on each
  experience; the rate limiter is in-memory by default and should be backed by a shared
  store (e.g. Redis) for multi-instance deployments.
- **Client addresses.** Per-client rate limits use an address only a proxy you run could
  have added. Set `CLIENT_IP_SOURCE` for what is in front of Interakt:
  `forwarded-for:1` for one proxy such as a hosting platform's ingress (the default),
  `forwarded-for:2` with a CDN or gateway in front of that, `header:<name>` for an edge that
  sends the client's address in a header of its own (such as `X-Azure-SocketIP` or
  `CF-Connecting-IP`), or `none` when nothing is in front (not recommended for production).
  With a CDN or gateway, accept traffic to the app only from it (for Azure Front Door, check
  `X-Azure-FDID`); otherwise a caller can skip it and choose its own address. Requests with no
  trusted address share one count at 10× the per-client limit, and Health shows when the
  setting doesn't match what requests show. `forwarded-for` alone counts `TRUSTED_PROXY_HOPS`
  proxies (default 1), and a setting Interakt doesn't understand falls back to that default and
  is shown on Health.
- **Transport.** Terminate TLS in front of the app and never disable certificate validation
  (`NODE_TLS_REJECT_UNAUTHORIZED=0`) outside of local development.

## Out of scope

- Issues that require a compromised host, a malicious admin user, or physical access.
- Findings against the bundled demo data or example configuration intended for local use.
- Vulnerabilities in third-party dependencies that already have a public advisory and a
  released fix — please just open a PR bumping the dependency.
