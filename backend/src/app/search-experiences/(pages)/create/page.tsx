import { redirect } from 'next/navigation';

export default function CreateSearchExperiencePage() {
  redirect('/experiences/create?type=search');
}
