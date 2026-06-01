import { redirect } from 'next/navigation';

export default async function EditSearchExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/experiences/search/${id}/edit`);
}
