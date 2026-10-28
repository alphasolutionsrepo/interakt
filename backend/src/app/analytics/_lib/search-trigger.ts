// app/analytics/_lib/search-trigger.ts

/** Names a step the way the admin knows it: the tool attached to the experience, or the AI feature */
const STEP_LABELS: Record<string, string> = {
  lookup: 'Find Record',
  enumerate: 'List Values',
  parameter_context: 'Filter values',
  query_interpretation: 'Query understanding',
  field_values_legacy: 'Field values (earlier)',
};

/** Who ran a search: a visitor, the AI's Search tool, another of its tools, or an AI feature's step */
export function searchTriggerLabel(triggerType: string, triggerStep: string | null | undefined): string {
  switch (triggerType) {
    case 'user':
      return 'Visitor';
    case 'ai_tool':
      return !triggerStep || triggerStep === 'search' ? 'AI assistant' : `AI assistant: ${STEP_LABELS[triggerStep] ?? triggerStep}`;
    case 'ai_step':
      return `AI step: ${STEP_LABELS[triggerStep ?? ''] ?? triggerStep ?? 'unknown'}`;
    default:
      return triggerType;
  }
}
