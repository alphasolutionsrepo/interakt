// app/analytics/_lib/sections.ts

/**
 * The sections of the analytics workspace, in the order they appear. Each is a
 * route under /analytics sharing one filter bar and the Ask panel.
 */

export interface AnalyticsSection {
  href: string;
  label: string;
  /** One line under the workspace title */
  description: string;
  /** Only for chat (AI) experiences and the all-experiences view */
  chatOnly?: boolean;
  /** Questions the Ask panel suggests on this section */
  suggestions: string[];
}

export const ANALYTICS_SECTIONS: readonly AnalyticsSection[] = [
  {
    href: '/analytics/overview',
    label: 'Overview',
    description: 'What needs attention, and answers to your questions about it',
    suggestions: [
      'What changed most compared with the previous period?',
      'What should I fix first?',
      'Summarize how this experience is doing',
    ],
  },
  {
    href: '/analytics/search',
    label: 'Search',
    description: 'What people searched for, and how well search answered',
    suggestions: [
      'Which searches most often find nothing?',
      'What are people searching for most?',
      'Is search getting slower?',
    ],
  },
  {
    href: '/analytics/conversations',
    label: 'Conversations',
    description: 'How the assistant handled conversations, and what people asked about',
    chatOnly: true,
    suggestions: [
      'Why do conversations fail?',
      'What do people ask about most?',
      'How often does the guardrail block questions?',
    ],
  },
  {
    href: '/analytics/ai',
    label: 'AI & cost',
    description: 'Model calls, tokens, cost and tool usage',
    chatOnly: true,
    suggestions: [
      'Which conversations use the most tokens?',
      'Which tools fail most often?',
      'How much does an average conversation cost?',
    ],
  },
  {
    href: '/analytics/traces',
    label: 'Traces',
    description: 'Every chat turn, search and AI summary: what was asked, what ran, and how long it took',
    suggestions: ['Show me the slowest conversations', 'Which conversations failed today?'],
  },
  {
    href: '/analytics/settings',
    label: 'Settings',
    description: 'When insights refresh, what is tracked, and analytics data',
    suggestions: [],
  },
];

/** The home page's Ask chat: not an analytics section, but asked about the same data */
export const HOME_SECTION: AnalyticsSection = {
  href: '/dashboard',
  label: 'Home',
  description: 'How your experiences are doing',
  suggestions: [
    'What needs attention right now?',
    'What changed most compared with the week before?',
    'Which experience is doing worst?',
  ],
};

/** The section for a path, falling back to Overview */
export function sectionForPath(pathname: string): AnalyticsSection {
  return ANALYTICS_SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)) ?? ANALYTICS_SECTIONS[0];
}
