// src/features/guardrails/greeting-detector.test.ts

import { describe, it, expect } from 'vitest';
import { detectGreeting } from './greeting-detector';

describe('detectGreeting', () => {
  // ── Positive cases (should match) ──────────────────────────────────────

  it.each([
    'Hello',
    'hello',
    'Hi',
    'hi',
    'Hey',
    'hey',
    'Howdy',
    'Hiya',
    'Yo',
    'Sup',
    'Hola',
  ])('detects simple greeting: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it.each([
    'Good morning',
    'good afternoon',
    'Good Evening',
    'good night',
    'Good day',
  ])('detects time-based greeting: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it.each([
    'How are you',
    "What's up",
    "How's it going",
  ])('detects conversational opener: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it.each([
    'Thanks',
    'Thank you',
    'Thx',
    'Ty',
  ])('detects gratitude: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it.each([
    'Bye',
    'Goodbye',
    'See you',
    'Take care',
    'Cya',
    'Later',
    'Cheers',
  ])('detects farewell: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it.each([
    'Namaste',
    'Namaskar',
  ])('detects Hindi greeting: "%s"', (msg) => {
    expect(detectGreeting(msg)).toBe(true);
  });

  it('handles trailing punctuation', () => {
    expect(detectGreeting('Hello!')).toBe(true);
    expect(detectGreeting('Hi!!')).toBe(true);
    expect(detectGreeting('Hey...')).toBe(true);
    expect(detectGreeting('Hello?')).toBe(true);
  });

  it('handles trailing emoji', () => {
    expect(detectGreeting('Hello 👋')).toBe(true);
    expect(detectGreeting('Namaste 🙏')).toBe(true);
    expect(detectGreeting('Hi 😊')).toBe(true);
  });

  it('handles leading/trailing whitespace', () => {
    expect(detectGreeting('  Hello  ')).toBe(true);
    expect(detectGreeting('\tHi\n')).toBe(true);
  });

  // ── Negative cases (should NOT match) ──────────────────────────────────

  it('does not match greeting followed by a question', () => {
    expect(detectGreeting('Hello, I need help finding a product')).toBe(false);
  });

  it('does not match greeting followed by a topic', () => {
    expect(detectGreeting('Hi, can you tell me about your shoes?')).toBe(false);
  });

  it('does not match partial word matches', () => {
    expect(detectGreeting('Hello kitty doll')).toBe(false);
  });

  it('does not match domain questions', () => {
    expect(detectGreeting('How do I wash my jeans?')).toBe(false);
  });

  it('does not match off-topic questions', () => {
    expect(detectGreeting('What is 2+2?')).toBe(false);
  });

  it('does not match multi-sentence with greeting', () => {
    expect(detectGreeting('Hey. I want to order something.')).toBe(false);
  });

  it('does not match empty string', () => {
    expect(detectGreeting('')).toBe(false);
  });

  it('does not match whitespace only', () => {
    expect(detectGreeting('   ')).toBe(false);
  });
});
