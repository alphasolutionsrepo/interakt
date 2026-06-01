'use client';

import { use } from 'react';
import { SearchExperienceEdit } from '@/app/search-experiences/_components/SearchExperienceEdit';

export default function ExperienceSearchEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SearchExperienceEdit id={id} basePath="/experiences/search" listPath="/experiences" />;
}
