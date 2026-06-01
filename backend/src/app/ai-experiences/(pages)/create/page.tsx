import { redirect } from 'next/navigation';

export default function CreateAIExperiencePage() {
  redirect('/experiences/create?type=ai');
}
