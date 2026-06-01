'use client';

import { SearchProviderConfig } from './configs/SearchProviderConfig';
import { HttpApiConfig } from './configs/HttpApiConfig';
import { WebSearchConfig } from './configs/WebSearchConfig';
import { AiResponderConfig } from './configs/AiResponderConfig';
import type { ExecutorType } from '../../_lib/api-client';

export interface DataSourceMeta {
  name: string;
  slug: string;
  description: string | null;
  type: string;
}

interface Step2Props {
  executorType: ExecutorType;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors: Record<string, string>;
  onSchemaImport?: (outputSchema: object) => void;
  onDataSourceSelected?: (meta: DataSourceMeta) => void;
}

export function Step2_Config({ executorType, value, onChange, errors, onSchemaImport, onDataSourceSelected }: Step2Props) {
  switch (executorType) {
    case 'data_source':
      return <SearchProviderConfig value={value} onChange={onChange} errors={errors} onSchemaImport={onSchemaImport} onDataSourceSelected={onDataSourceSelected} />;
    case 'http':
      return <HttpApiConfig value={value} onChange={onChange} errors={errors} />;
    case 'web_search':
      return <WebSearchConfig value={value} onChange={onChange} errors={errors} />;
    case 'ai_call':
      return <AiResponderConfig value={value} onChange={onChange} errors={errors} />;
    default:
      return null;
  }
}
