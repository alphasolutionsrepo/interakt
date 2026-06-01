// Empty stub for the `server-only` package, aliased in vitest.config.ts.
// Real `server-only` throws at import to prevent client bundles from pulling
// in server code; in unit tests we don't have that distinction, so we no-op.
export {};
