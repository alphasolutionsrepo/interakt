'use client';

import { use } from 'react';
import { AIExperienceEdit } from '@/app/ai-experiences/_components/AIExperienceEdit';

export default function ExperienceAIEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AIExperienceEdit id={id} basePath="/experiences/ai" listPath="/experiences" />;
}
