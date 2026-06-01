import { redirect } from 'next/navigation';

export default function AIExperiencesPage() {
  redirect('/experiences?type=ai');
}
