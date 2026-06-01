'use client';

import { use } from 'react';
import { AIExperienceDetail } from '@/app/ai-experiences/_components/AIExperienceDetail';

export default function ExperienceAIDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AIExperienceDetail id={id} basePath="/experiences/ai" listPath="/experiences" />;
}
