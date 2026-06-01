import { redirect } from 'next/navigation';

export default async function EditAIExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/experiences/ai/${id}/edit`);
}
