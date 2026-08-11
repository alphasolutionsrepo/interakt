'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, FileText, Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton } from '@/shared/ui/custom/skeletons';

import { PromptContentViewer } from '../../_components/PromptContentViewer';
import { PromptEditor } from '../../_components/PromptEditor';
import { SectionsList } from '../../_components/SectionsList';
import { VariableLegend } from '../../_components/VariableLegend';
import { VersionHistory } from '../../_components/VersionHistory';
import { usePromptTemplate } from '../../_lib/hooks/usePromptTemplates';
import { STATUS_CONFIG, STEP_LABELS } from '../../_lib/template-display';

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PromptTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    template,
    isLoading,
    history,
    isLoadingHistory,
    rollback,
    isRollingBack,
    createVersion,
    isCreatingVersion,
  } = usePromptTemplate(id);

  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeaderSkeleton />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <FileText className="size-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground mb-4">Template not found.</p>
        <Button variant="outline" onClick={() => router.push('/prompt-templates')}>
          Back to Templates
        </Button>
      </div>
    );
  }

  const stepConfig = STEP_LABELS[template.step] ?? { label: template.step, color: '' };
  const status = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.icon;

  /**
   * Save an edit as a new version, and point the step at it unless told not to.
   *
   * createVersion writes isSystemDefault: false, so without the activation step a saved
   * edit would sit inert while the operator believed it had taken effect. Activation uses
   * the rollback endpoint, which sets any version as the step's default — the name reads
   * backwards for a forward move, but it is the operation that exists and does exactly this.
   */
  const handleSave = async (input: { content: string; label?: string; makeActive: boolean }) => {
    try {
      const created = await createVersion({
        parentId: id,
        content: input.content,
        label: input.label,
        metadata: template.metadata,
      });
      if (input.makeActive) {
        await rollback({ targetVersionId: created.id });
      }
      setIsEditing(false);
      // The new version is a different row, so stay useful by going to it.
      router.push(`/prompt-templates/${created.id}`);
    } catch {
      // Error toast handled by the hook; stay in the editor so the text is not lost.
    }
  };

  const handleRollback = async (targetId: string) => {
    try {
      await rollback({ targetVersionId: targetId });
    } catch {
      // Error toast handled by the hook
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        variant="detail"
        title={template.label ?? `${stepConfig.label} v${template.version}`}
        description={`Version ${template.version} of the ${stepConfig.label.toLowerCase()} prompt template`}
        breadcrumb={
          <>
            <Link href="/prompt-templates" className="text-muted-foreground hover:text-foreground transition-colors">
              Prompt Templates
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span>{stepConfig.label}</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span>v{template.version}</span>
          </>
        }
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/10">
            <FileText className="size-6 text-violet-500" />
          </div>
        }
        badge={
          <div className="flex items-center gap-2">
            <Badge className={`${stepConfig.color} border-0 text-xs`}>
              {stepConfig.label}
            </Badge>
            <span className={`flex items-center gap-1 text-xs ${status.color}`}>
              <StatusIcon className="size-3" />
              {status.label}
            </span>
            {template.isSystemDefault && (
              <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-200">
                System Default
              </Badge>
            )}
          </div>
        }
      />

      {/* Two-column layout: content + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {isEditing ? (
            <PromptEditor
              template={template}
              onCancel={() => setIsEditing(false)}
              onSave={handleSave}
              isSaving={isCreatingVersion || isRollingBack}
            />
          ) : (
            <>
              <div className="flex justify-end">
                <Button onClick={() => setIsEditing(true)} className="gap-1.5">
                  <Pencil className="size-3.5" />
                  Edit prompt
                </Button>
              </div>
              <PromptContentViewer
                content={template.content}
                sections={template.metadata?.sections ?? []}
                variables={template.metadata?.variables ?? []}
              />
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <VariableLegend variables={template.metadata?.variables ?? []} />
          <SectionsList sections={template.metadata?.sections ?? []} />
          <VersionHistory
            history={history}
            currentId={id}
            onRollback={handleRollback}
            isRollingBack={isRollingBack}
          />
        </div>
      </div>
    </div>
  );
}
