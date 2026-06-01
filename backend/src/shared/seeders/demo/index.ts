// src/shared/seeders/demo/index.ts

export { loadDemoManifest, defaultManifestPath, demoManifestSchema } from './demo-manifest';
export type { DemoManifest, DemoProviderOption, LoadedDemoManifest, MappingFieldEntry } from './demo-manifest';

export { seedDemo, resetDemo } from './demo.seeder';
export type { DemoSeedOptions, DemoSeedSummary, DemoResetSummary } from './demo.seeder';

export { runWarmup } from './demo-warmup';
export type { WarmupSummary } from './demo-warmup';

// NOTE: client components must import demo-steps DIRECTLY (not via this barrel),
// since the barrel re-exports server-only modules above.
export { DEMO_SEED_STEPS } from './demo-steps';
export type { DemoStep, DemoStepId, SeedProgressEvent } from './demo-steps';
