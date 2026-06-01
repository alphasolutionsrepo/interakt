// app/search-indexes/(pages)/create/page.tsx

'use client';

import Link from 'next/link';
import { Database, ChevronLeft } from 'lucide-react';
import { CreateWizard } from '../../_components/CreateWizard';

export default function CreateSearchIndexPage() {
    return (
        <div className="flex-1 space-y-8 p-6 lg:p-8">
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/search-indexes" className="hover:text-foreground transition-colors">
                    Search Indexes
                </Link>
                <ChevronLeft className="h-4 w-4 rotate-180" />
                <span className="text-foreground font-medium">Create New</span>
            </nav>

            {/* Page Header */}
            <div className="flex items-start gap-4">
                <div className="flex size-14 items-center justify-center rounded-xl shadow-sm bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent ring-1 ring-emerald-500/30">
                    <Database className="size-7 text-emerald-500" />
                </div>
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Create Search Index</h1>
                    <p className="text-base text-muted-foreground mt-2">
                        Set up a new search index with your preferred configuration
                    </p>
                </div>
            </div>

            {/* Wizard */}
            <CreateWizard />
        </div>
    );
}
