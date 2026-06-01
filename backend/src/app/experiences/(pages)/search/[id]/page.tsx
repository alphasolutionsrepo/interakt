'use client';

import { use } from 'react';
import { SearchExperienceDetail } from '@/app/search-experiences/_components/SearchExperienceDetail';

export default function ExperienceSearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SearchExperienceDetail id={id} basePath="/experiences/search" listPath="/experiences" />;
}
