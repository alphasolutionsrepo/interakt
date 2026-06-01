// app/playground/unified-search/page.tsx
// Redirects to the combined search playground

import { redirect } from 'next/navigation';

export default function UnifiedSearchPlaygroundPage() {
    redirect('/playground/search');
}
