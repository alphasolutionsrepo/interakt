// src/features/tools/index.ts

export * from './tools.service';
export * from './tools.types';
export { EXECUTOR_TYPES, DATA_SOURCE_OPERATIONS } from './tools.validation';
export { MEMORY_RETRIEVAL_TOOL_DEFINITION } from './executors/memory-retrieval';

// Capability Registry
export {
  DATA_SOURCE_CAPABILITIES,
  STANDALONE_EXECUTORS,
  getOperationsForDataSource,
  isOperationSupported,
  getOperationCapability,
  getStandaloneExecutor,
  generateToolSlug,
  generateToolName,
  getAllExecutorTypes,
} from './tools.registry';
export type {
  ExecutorType,
  DataSourceOperation,
  DataSourceType,
  OperationCapability,
  StandaloneExecutorCapability,
} from './tools.registry';

// Description Generator
export {
  generateToolDescription,
} from './tools.description-generator';
export type {
  GeneratedToolDescription,
} from './tools.description-generator';
