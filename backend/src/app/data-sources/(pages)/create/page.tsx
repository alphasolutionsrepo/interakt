'use client';

import Link from 'next/link';
import { Database, Plus, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { CreateWizard } from '../../_components/CreateWizard/CreateWizard';

export default function CreateDataSourcePage() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title="Create Data Source"
        description="Connect a new data source for use in AI experiences."
        breadcrumb={
          <>
            <Link href="/data-sources" className="hover:text-foreground transition-colors font-medium">
              Data Sources
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">Create</span>
          </>
        }
        customIcon={
          <div className="relative">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent ring-1 ring-blue-500/30 shadow-sm">
              <Database className="size-6 text-blue-500" />
            </div>
            <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-primary ring-2 ring-background">
              <Plus className="size-3 text-white" />
            </div>
          </div>
        }
      />
      <CreateWizard />
    </div>
  );
}
