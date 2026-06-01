// src/features/guardrails/greeting-detector.ts

/**
 * Greeting Detector — Pure Regex Module
 *
 * Detects standalone greetings: the entire message must be a greeting
 * plus optional punctuation/emoji. "Hello" matches, but
 * "Hello, I need help finding a product" does NOT match.
 *
 * This is the first gate in the message classification pipeline.
 * Cost: ~0ms (no AI calls, no embeddings).
 */

/**
 * Anchored regex matching standalone greetings.
 *
 * Structure: ^[\s]*(greeting pattern)[\s,!.?…🙏👋]*$
 *
 * Covers:
 * - English greetings: hello, hi, hey, howdy, yo, sup, hiya
 * - Time-based: good morning/afternoon/evening/night/day
 * - Polite: how are you, what's up, how's it going
 * - Thanks: thanks, thank you, thx, ty
 * - Farewell: bye, goodbye, see you, take care, cya, later
 * - Hindi greetings: namaste, namaskar
 */
const GREETING_PATTERN = new RegExp(
  [
    '^\\s*(',
    // Simple greetings (with optional "there")
    'h(?:ello|i|ey|owdy|iya)(?:\\s+there)?',
    '|yo|sup|hola|ola',
    // Time-based greetings
    '|good\\s+(?:morning|afternoon|evening|night|day)',
    // Conversational openers (standalone only)
    "|(?:how\\s+are\\s+you|what'?s\\s+up|how'?s\\s+it\\s+going|how\\s+do\\s+you\\s+do)",
    // Thanks
    '|(?:thanks?(?:\\s+you)?|thx|ty)',
    // Farewell
    '|(?:bye|goodbye|good\\s*bye|see\\s+you|take\\s+care|cya|later|cheers)',
    // Hindi
    '|(?:namaste|namaskar)',
    // Generic
    '|(?:greetings|salutations)',
    ')\\s*[,!.?…🙏👋😊🙂]*\\s*$',
  ].join(''),
  'i',
);

/**
 * Detect whether a message is a standalone greeting.
 *
 * Returns `true` only when the **entire** message is a greeting
 * (plus optional trailing punctuation/emoji). Messages that contain
 * a greeting followed by a question or statement return `false`.
 */
export function detectGreeting(message: string): boolean {
  return GREETING_PATTERN.test(message.trim());
}
