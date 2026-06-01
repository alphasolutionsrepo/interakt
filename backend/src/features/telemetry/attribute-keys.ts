// src/features/telemetry/attribute-keys.ts

/**
 * Semantic attribute keys for Alpha Search spans.
 *
 * Naming convention follows OTel semantic conventions:
 * - Dot-separated, lowercase
 * - Prefixed with "alpha." for project-specific attributes
 */
export const ATTR = {
  // === Request Identity ===
  REQUEST_ID: 'alpha.request.id',
  SESSION_ID: 'alpha.session.id',
  CHAT_SESSION_ID: 'alpha.chat.session_id',

  // === Experience ===
  EXPERIENCE_ID: 'alpha.experience.id',
  EXPERIENCE_TYPE: 'alpha.experience.type', // 'search' | 'ai'
  EXPERIENCE_SLUG: 'alpha.experience.slug',

  // === Pipeline ===
  PIPELINE_TYPE: 'alpha.pipeline.type', // 'agentic' | 'deterministic' | 'ai_experience'
  PIPELINE_PHASE: 'alpha.pipeline.phase', // 'intent' | 'validation' | 'execution' | 'synthesis' | 'state_update'

  // === AI Provider ===
  AI_PROVIDER_KEY: 'alpha.ai.provider_key', // 'openai' | 'ollama'
  AI_PROVIDER_ID: 'alpha.ai.provider_id',
  AI_MODEL_KEY: 'alpha.ai.model_key', // 'gpt-4o' | 'llama3.2'
  AI_MODEL_ID: 'alpha.ai.model_id',
  AI_OPERATION: 'alpha.ai.operation', // 'text' | 'chat' | 'embedding'
  AI_STREAMING: 'alpha.ai.streaming',
  AI_HAS_TOOLS: 'alpha.ai.has_tools',
  AI_EMBEDDING_FEATURE: 'alpha.ai.embedding_feature', // 'search_query' | 'session_message' | 'embedding_service'

  // === Token Usage ===
  AI_INPUT_TOKENS: 'alpha.ai.input_tokens',
  AI_OUTPUT_TOKENS: 'alpha.ai.output_tokens',
  AI_TOTAL_TOKENS: 'alpha.ai.total_tokens',
  AI_TIME_TO_FIRST_TOKEN: 'alpha.ai.time_to_first_token_ms',

  // === Search ===
  SEARCH_QUERY: 'alpha.search.query',
  SEARCH_TYPE: 'alpha.search.type', // 'lexical' | 'semantic' | 'hybrid'
  SEARCH_INDEX_ID: 'alpha.search.index_id',
  SEARCH_INDEX_NAME: 'alpha.search.index_name',
  SEARCH_PROVIDER: 'alpha.search.provider', // 'elasticsearch' | 'azure_ai_search'
  SEARCH_TOTAL_RESULTS: 'alpha.search.total_results',
  SEARCH_RETURNED: 'alpha.search.results_returned',
  SEARCH_HAS_FILTERS: 'alpha.search.has_filters',
  SEARCH_TRIGGER: 'alpha.search.trigger_type', // 'user' | 'ai_tool' | 'ai_rag'
  SEARCH_ES_TOOK_MS: 'alpha.search.es_took_ms',

  // === Tool Execution ===
  TOOL_ID: 'alpha.tool.id',
  TOOL_NAME: 'alpha.tool.name',
  TOOL_SLUG: 'alpha.tool.slug',
  TOOL_TYPE: 'alpha.tool.type', // 'search' | 'lookup' | 'http_api' | 'web_search' | 'ai_responder'
  TOOL_SUCCESS: 'alpha.tool.success',
  TOOL_CALL_COUNT: 'alpha.tool.call_count',
  TOOL_DURATION_MS: 'alpha.tool.duration_ms',
  TOOL_ATTEMPT: 'alpha.tool.attempt', // current retry attempt (1-based)
  TOOL_RETRIES: 'alpha.tool.retries_used', // total retries before success/failure
  TOOL_TIMED_OUT: 'alpha.tool.timed_out',
  TOOL_FALLBACK_USED: 'alpha.tool.fallback_used',
  TOOL_FALLBACK_TYPE: 'alpha.tool.fallback_type',
  TOOL_INPUT_VALID: 'alpha.tool.input_valid',
  TOOL_INPUT_PARAMS: 'alpha.tool.input_params',  // JSON string of extracted parameters
  TOOL_OUTPUT_VALID: 'alpha.tool.output_valid',
  TOOL_RESULT_COUNT: 'alpha.tool.result_count',  // results returned in this call
  TOOL_TOTAL_COUNT: 'alpha.tool.total_count',    // total matching documents
  TOOL_RESULT_SIZE_CHARS: 'alpha.tool.result_size_chars',  // chars of JSON-stringified result fed back to the LLM
  TOOL_RESULT_EST_TOKENS: 'alpha.tool.result_est_tokens',  // rough token estimate (chars/4); surfaces MCP/RAG bloat

  // === Chat Turn ===
  CHAT_USER_MESSAGE: 'alpha.chat.user_message',
  CHAT_AI_DECISION: 'alpha.chat.ai_decision_type', // 'direct_response' | 'tool_call' | 'error'
  CHAT_RESPONSE_PRESET: 'alpha.chat.response_preset', // 'item_grid' | 'single_card' | 'markdown_rich'
  CHAT_CONTEXT_SOURCE: 'alpha.chat.context_source',

  // === Error ===
  ERROR_CODE: 'alpha.error.code',
  ERROR_MESSAGE: 'alpha.error.message',

  // === V2 Guardrail ===
  V2_GUARDRAIL_CLASSIFICATION: 'alpha.v2.guardrail.classification',
  V2_GUARDRAIL_GREETING_REGEX: 'alpha.v2.guardrail.greeting_regex_matched',
  V2_GUARDRAIL_DOMAIN_FILTER_ENABLED: 'alpha.v2.guardrail.domain_filter_enabled',
  V2_GUARDRAIL_DOMAIN_SIMILARITY: 'alpha.v2.guardrail.domain_similarity',
  V2_GUARDRAIL_GENERAL_SIMILARITY: 'alpha.v2.guardrail.general_similarity',
  V2_GUARDRAIL_CLOSEST_DOMAIN_TERM: 'alpha.v2.guardrail.closest_domain_term',
  V2_GUARDRAIL_CLOSEST_GENERAL_TERM: 'alpha.v2.guardrail.closest_general_term',
  V2_GUARDRAIL_SHORT_CIRCUITED: 'alpha.v2.guardrail.short_circuited',
  V2_GUARDRAIL_BLOCKLIST_MATCHED: 'alpha.v2.guardrail.blocklist_matched',
} as const;
