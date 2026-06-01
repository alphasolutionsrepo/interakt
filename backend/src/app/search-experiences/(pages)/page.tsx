import { redirect } from 'next/navigation';

export default function SearchExperiencesPage() {
  redirect('/experiences?type=search');
}
