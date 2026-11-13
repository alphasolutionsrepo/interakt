// app/setup/_lib/demo-card.ts

/**
 * What the demo part of Initial Setup shows: the full card, only the note, or the note plus
 * a card to remove demo data that was set up earlier (an area it needs is off).
 */
export type DemoCardView = 'full' | 'remove' | 'note';

export function demoCardView({ seeded, areasNeededOn }: { seeded: boolean; areasNeededOn: boolean }): DemoCardView {
  if (areasNeededOn) return 'full';
  return seeded ? 'remove' : 'note';
}
