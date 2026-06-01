import { redirect } from 'next/navigation';

export default async function AIExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/experiences/ai/${id}`);
}
