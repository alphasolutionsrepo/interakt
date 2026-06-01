// src/shared/config/business-domains.ts

/**
 * Business domain options for the domain restriction feature.
 *
 * These appear in the admin UI dropdown when configuring domain restrictions
 * for AI chat. Add/remove/reorder entries here — all UI components and
 * validation logic read from this single list.
 */
export const BUSINESS_DOMAIN_OPTIONS = [
  'Fashion & Apparel',
  'Food & Dining',
  'Real Estate',
  'Travel & Hospitality',
  'Electronics & Technology',
  'Healthcare & Wellness',
  'Automotive',
  'Beauty & Cosmetics',
  'Sports & Outdoors',
  'Home & Garden',
  'Books & Media',
  'Financial Services',
  'Education & Training',
  'Legal Services',
  'Entertainment & Events',
] as const;

export type BusinessDomain = (typeof BUSINESS_DOMAIN_OPTIONS)[number];
