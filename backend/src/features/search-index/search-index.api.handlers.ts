// src/features/search-index/search-index.api.handlers.ts

/**
 * Search Index Feature - API Handlers
 * 
 * Handles HTTP request/response for search index operations.
 * All business logic is delegated to the service layer.
 * 
 * UPDATED: Added handlers for new mapping config endpoints
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

// Service imports
import * as service from './search-index.service';
import * as fieldsService from './search-index-fields.service';

// Validation imports
import {
    createSearchIndexSchema,
    updateSearchIndexSchema,
    changeAIConfigSchema,
    listSearchIndexesQuerySchema,
    searchIndexIdSchema,
    searchIndexNameSchema,
    searchIndexExportSchema,
    searchIndexImportSchema,
} from './search-index.validation';

import {
    createSearchIndexFieldSchema,
    updateSearchIndexFieldSchema,
    bulkUpdateFieldMappingsSchema,
    fieldMappingConfigSchema,
    additionalDataConfigSchema,
    searchIndexFieldIdSchema,
} from './search-index-fields.validation';

import type { FieldMappingConfig, UpdateSearchIndexFieldDTO } from './search-index-fields.types';

const logger = createLogger('search-index-handlers');

// ============================================================================
// SEARCH INDEX: CRUD HANDLERS
// ============================================================================

/**
 * POST /api/search-indexes
 * Create a new search index
 */
export async function handleCreateSearchIndex(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const body = await request.json();
        const validation = createSearchIndexSchema.safeParse(body);

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const searchIndex = await service.createSearchIndex(validation.data, userId);

        logger.info('Created search index via API', {
            indexId: searchIndex.id,
            name: searchIndex.name,
            userId,
        });

        // Use success with 201 status for created resources
        return apiResponse.success(searchIndex, 201);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create search index', err);

        if (err.message.includes('already exists')) {
            return apiResponse.badRequest(err.message);
        }

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/all
 * Get all active search indexes (for dropdowns/selectors)
 */
export async function handleGetAllActiveSearchIndexes() {
    try {
        const indexes = await service.getAllActiveSearchIndexes();
        return apiResponse.success(indexes);
    } catch (error) {
        logger.error('Failed to get all active search indexes', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * GET /api/search-indexes
 * List search indexes with pagination and filtering
 */
export async function handleListSearchIndexes(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = Object.fromEntries(searchParams.entries());

        const validation = listSearchIndexesQuerySchema.safeParse(query);

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const result = await service.listSearchIndexes(validation.data);

        return apiResponse.success(result);
    } catch (error) {
        logger.error('Failed to list search indexes', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * GET /api/search-indexes/:id
 * Get a single search index by ID
 */
export async function handleGetSearchIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const searchIndex = await service.getSearchIndexById(validation.data.id);

        if (!searchIndex) {
            return apiResponse.notFound(`Search index with ID ${params.id} not found`);
        }

        return apiResponse.success(searchIndex);
    } catch (error) {
        logger.error('Failed to get search index', error as Error);
        return apiResponse.error(error as Error);
    }
}

// Alias for backward compatibility
export const handleGetSearchIndexById = handleGetSearchIndex;

/**
 * GET /api/search-indexes/name/:name
 * Get a search index by name
 */
export async function handleGetSearchIndexByName(
    request: NextRequest,
    context: { params: Promise<{ name: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexNameSchema.safeParse({ name: params.name });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const searchIndex = await service.getSearchIndexByName(validation.data.name);

        if (!searchIndex) {
            return apiResponse.notFound(`Search index with name "${params.name}" not found`);
        }

        return apiResponse.success(searchIndex);
    } catch (error) {
        logger.error('Failed to get search index by name', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * PUT /api/search-indexes/:id
 * Update a search index
 */
export async function handleUpdateSearchIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();
        const bodyValidation = updateSearchIndexSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        const searchIndex = await service.updateSearchIndex(
            idValidation.data.id,
            bodyValidation.data,
            userId
        );

        logger.info('Updated search index via API', {
            indexId: searchIndex.id,
            userId,
        });

        return apiResponse.success(searchIndex);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to update search index', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * DELETE /api/search-indexes/:id
 * Delete a search index
 */
export async function handleDeleteSearchIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        await service.deleteSearchIndex(validation.data.id, userId);

        logger.info('Deleted search index via API', {
            indexId: validation.data.id,
            userId,
        });

        return apiResponse.success({ message: 'Search index deleted successfully' });
    } catch (error) {
        if (error instanceof service.SearchIndexInUseError) {
            return apiResponse.conflict(error.message);
        }

        const err = error as Error;
        logger.error('Failed to delete search index', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

// ============================================================================
// SEARCH INDEX: STATUS HANDLERS
// ============================================================================

/**
 * PATCH /api/search-indexes/:id/activate
 * Activate a search index
 */
export async function handleActivateSearchIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        // Use setSearchIndexActive with true
        const searchIndex = await service.setSearchIndexActive(
            validation.data.id,
            true,
            userId
        );

        logger.info('Activated search index via API', {
            indexId: validation.data.id,
            userId,
        });

        return apiResponse.success(searchIndex);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to activate search index', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * PATCH /api/search-indexes/:id/deactivate
 * Deactivate a search index
 */
export async function handleDeactivateSearchIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        // Use setSearchIndexActive with false
        const searchIndex = await service.setSearchIndexActive(
            validation.data.id,
            false,
            userId
        );

        logger.info('Deactivated search index via API', {
            indexId: validation.data.id,
            userId,
        });

        return apiResponse.success(searchIndex);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to deactivate search index', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/change-ai-config
 * Change AI configuration (provider, model, dimensions)
 *
 * WARNING: This is a destructive operation that deletes the ES index
 */
export async function handleChangeAIConfig(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();
        const bodyValidation = changeAIConfigSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        const result = await service.changeAIConfiguration(
            idValidation.data.id,
            bodyValidation.data,
            userId
        );

        logger.info('Changed AI configuration via API', {
            indexId: idValidation.data.id,
            documentsDeleted: result.documentsDeleted,
            userId,
        });

        return apiResponse.success({
            message: `AI configuration updated successfully. ${result.documentsDeleted > 0 ? `${result.documentsDeleted} documents were removed and will need to be re-indexed.` : 'No documents were affected.'}`,
            searchIndex: result.searchIndex,
            documentsDeleted: result.documentsDeleted,
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to change AI configuration', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        if (err.message.includes('Cannot change AI configuration')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/stats
 * Get index statistics
 */
export async function handleGetIndexStats(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const stats = await service.getIndexStats(validation.data.id);

        return apiResponse.success(stats);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to get index stats', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/sync-status
 * Get mapping sync status
 */
export async function handleGetMappingSyncStatus(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const status = await service.getMappingSyncStatus(validation.data.id);

        return apiResponse.success(status);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to get mapping sync status', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

// Alias for backward compatibility
export const handleGetSyncStatus = handleGetMappingSyncStatus;

/**
 * POST /api/search-indexes/:id/reindex
 * Trigger reindex - performs full reindex:
 * 1. Fetches all documents from ES
 * 2. Deletes the ES index
 * 3. Recreates with updated mappings
 * 4. Re-indexes all documents
 */
export async function handleTriggerReindex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const result = await service.triggerReindex(validation.data.id, userId);

        logger.info('Reindex completed via API', {
            indexId: validation.data.id,
            userId,
            documentCount: result.documentCount,
            durationMs: result.durationMs,
        });

        return apiResponse.success({
            message: 'Reindex completed successfully',
            documentCount: result.documentCount,
            durationMs: result.durationMs,
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to trigger reindex', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/recreate-index
 * Recreate the search provider index from DB field definitions.
 * Use when the provider index is missing (e.g. after a failed reindex).
 */
export async function handleRecreateEmptyIndex(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const result = await service.recreateEmptyIndex(validation.data.id, userId);

        if (!result.success) {
            return apiResponse.error(new Error(result.error || 'Failed to recreate index'));
        }

        logger.info('Empty index recreated via API', {
            indexId: validation.data.id,
            userId,
        });

        return apiResponse.success({
            message: 'Index recreated successfully. You can now re-upload documents.',
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to recreate empty index', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/check-name
 * Check if name is available
 */
export async function handleCheckNameAvailability(
    request: NextRequest,
    context?: { params: Promise<{ name: string }> }
) {
    try {
        const { searchParams } = new URL(request.url);
        
        // Get name from route params or query params
        let name: string | null = null;
        if (context?.params) {
            const params = await context.params;
            name = params.name;
        } else {
            name = searchParams.get('name');
        }
        
        const excludeId = searchParams.get('excludeId');

        if (!name) {
            return apiResponse.badRequest('Name parameter is required');
        }

        const validation = searchIndexNameSchema.safeParse({ name });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const isAvailable = await service.isNameAvailable(
            validation.data.name,
            excludeId ?? undefined
        );

        return apiResponse.success({
            name: validation.data.name,
            available: isAvailable,
        });
    } catch (error) {
        logger.error('Failed to check name availability', error as Error);
        return apiResponse.error(error as Error);
    }
}

// ============================================================================
// SEARCH INDEX FIELDS: HANDLERS
// ============================================================================

/**
 * POST /api/search-indexes/:id/fields
 * Create a new custom field on a search index
 */
export async function handleCreateField(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();
        const bodyValidation = createSearchIndexFieldSchema.safeParse(body);
        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        const d = bodyValidation.data;
        const field = await fieldsService.createField(
            idValidation.data.id,
            {
                fieldName: d.fieldName!,
                fieldType: d.fieldType!,
                displayName: d.displayName,
                isSearchable: d.isSearchable,
                isFacetable: d.isFacetable,
                includeInResponse: d.includeInResponse,
                boostValue: d.boostValue,
                isVectorSource: d.isVectorSource,
                isAutocomplete: d.isAutocomplete,
                isRequired: d.isRequired,
                mappingConfig: d.mappingConfig as FieldMappingConfig | undefined,
                sourceFieldPath: d.sourceFieldPath ?? d.sourceFieldName,
                providerFieldSettings: d.providerFieldSettings,
            },
            userId
        );

        logger.info('Created field via API', {
            fieldId: field.id,
            searchIndexId: idValidation.data.id,
            fieldName: field.fieldName,
            userId,
        });

        return apiResponse.success(field, 201);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create field', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }
        if (err.message.includes('already exists')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/fields/from-json
 * Create fields from a sample JSON document.
 * Infers types and creates fields that don't already exist.
 */
export async function handleCreateFieldsFromJson(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();

        // Accept { sampleJson: object | object[], maxDepth?: number }
        if (!body.sampleJson || typeof body.sampleJson !== 'object') {
            return apiResponse.badRequest('sampleJson is required and must be an object or array of objects');
        }

        // If array, use first element
        const sample = Array.isArray(body.sampleJson) ? body.sampleJson[0] : body.sampleJson;
        if (!sample || typeof sample !== 'object') {
            return apiResponse.badRequest('sampleJson must contain at least one object');
        }

        const result = await fieldsService.createFieldsFromJson(
            idValidation.data.id,
            sample as Record<string, unknown>,
            userId,
            { maxDepth: body.maxDepth }
        );

        logger.info('Created fields from JSON via API', {
            searchIndexId: idValidation.data.id,
            createdCount: result.created.length,
            skippedCount: result.skipped.length,
            userId,
        });

        return apiResponse.success({
            created: result.created,
            skipped: result.skipped,
            createdCount: result.created.length,
            skippedCount: result.skipped.length,
        }, 201);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create fields from JSON', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/fields/from-review
 * Create fields from user-reviewed definitions (with confirmed types/names).
 */
export async function handleCreateFieldsFromReview(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();

        if (!Array.isArray(body.fields) || body.fields.length === 0) {
            return apiResponse.badRequest('fields array is required and must not be empty');
        }

        // Validate each field has required properties
        for (const field of body.fields) {
            if (!field.fieldName || !field.fieldType) {
                return apiResponse.badRequest('Each field must have fieldName and fieldType');
            }
        }

        const created = await fieldsService.createFieldsFromReview(
            idValidation.data.id,
            body.fields,
            userId
        );

        logger.info('Created fields from review via API', {
            searchIndexId: idValidation.data.id,
            createdCount: created.length,
            userId,
        });

        return apiResponse.success({ created, createdCount: created.length }, 201);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create fields from review', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/fields/from-mapping
 * Create fields in bulk from exported field-mapping JSON entries.
 * Each entry's full mapping config + attributes are applied on create.
 */
export async function handleCreateFieldsFromMapping(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();

        if (!Array.isArray(body.entries) || body.entries.length === 0) {
            return apiResponse.badRequest('entries array is required and must not be empty');
        }

        // Light shape validation — service does the real per-entry validation
        for (const entry of body.entries) {
            if (!entry?.fieldName || typeof entry.fieldName !== 'string') {
                return apiResponse.badRequest('Each entry must have a fieldName');
            }
            if (!entry?.fieldType || typeof entry.fieldType !== 'string') {
                return apiResponse.badRequest(`Entry "${entry.fieldName}": fieldType is required`);
            }
            if (!entry?.mapping || typeof entry.mapping !== 'object') {
                return apiResponse.badRequest(`Entry "${entry.fieldName}": mapping object is required`);
            }
            if (!entry?.attributes || typeof entry.attributes !== 'object') {
                return apiResponse.badRequest(`Entry "${entry.fieldName}": attributes object is required`);
            }
        }

        const result = await fieldsService.createFieldsFromMappingEntries(
            idValidation.data.id,
            body.entries as fieldsService.MappingEntryInput[],
            userId,
        );

        logger.info('Created fields from mapping JSON via API', {
            searchIndexId: idValidation.data.id,
            requested: body.entries.length,
            createdCount: result.created.length,
            errorCount: result.errors.length,
            userId,
        });

        return apiResponse.success(
            {
                created: result.created,
                errors: result.errors,
                createdCount: result.created.length,
                errorCount: result.errors.length,
            },
            201,
        );
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create fields from mapping JSON', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * DELETE /api/search-indexes/:id/fields/:fieldId
 * Delete a custom field from a search index
 */
export async function handleDeleteField(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;

        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const fieldIdValidation = searchIndexFieldIdSchema.safeParse({
            fieldId: parseInt(params.fieldId, 10)
        });
        if (!fieldIdValidation.success) {
            return apiResponse.validationError(fieldIdValidation.error);
        }

        await fieldsService.deleteField(fieldIdValidation.data.fieldId, userId);

        logger.info('Deleted field via API', {
            fieldId: fieldIdValidation.data.fieldId,
            searchIndexId: idValidation.data.id,
            userId,
        });

        return apiResponse.success({ message: 'Field deleted successfully' });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to delete field', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }
        if (err.message.includes('Cannot delete')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/fields
 * Get all fields for a search index
 */
export async function handleGetFields(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        // Use getFieldsBySearchIndexId (correct method name)
        const fields = await fieldsService.getFieldsBySearchIndexId(validation.data.id);

        return apiResponse.success(fields);
    } catch (error) {
        logger.error('Failed to get fields', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * GET /api/search-indexes/:id/fields/summary
 * Get field mapping summary for a search index
 */
export async function handleGetFieldsSummary(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const summary = await fieldsService.getFieldMappingSummary(validation.data.id);

        return apiResponse.success(summary);
    } catch (error) {
        logger.error('Failed to get fields summary', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * PUT /api/search-indexes/:id/fields/:fieldId
 * Update a single field configuration
 */
export async function handleUpdateField(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const fieldIdValidation = searchIndexFieldIdSchema.safeParse({ 
            fieldId: parseInt(params.fieldId, 10) 
        });
        if (!fieldIdValidation.success) {
            return apiResponse.validationError(fieldIdValidation.error);
        }

        const body = await request.json();
        const bodyValidation = updateSearchIndexFieldSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        const field = await fieldsService.updateField(
            fieldIdValidation.data.fieldId,
            bodyValidation.data as UpdateSearchIndexFieldDTO,
            userId
        );

        logger.info('Updated field via API', {
            fieldId: field.id,
            searchIndexId: idValidation.data.id,
            userId,
        });

        return apiResponse.success(field);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to update field', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        if (err.message.includes('already mapped')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/fields/:fieldId/distinct-values
 * Get distinct indexed values for a facetable field.
 * Used for auto-generating filter canonical value mappings.
 */
export async function handleGetFieldDistinctValues(
    _request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;

        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const fieldIdValidation = searchIndexFieldIdSchema.safeParse({
            fieldId: parseInt(params.fieldId, 10)
        });
        if (!fieldIdValidation.success) {
            return apiResponse.validationError(fieldIdValidation.error);
        }

        const result = await fieldsService.getFieldDistinctValues(
            idValidation.data.id,
            fieldIdValidation.data.fieldId
        );

        return apiResponse.success(result);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to get distinct values', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        if (err.message.includes('not facetable')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * PUT /api/search-indexes/:id/fields/:fieldId/config
 * Update a field's mapping configuration only (mode, static value, generator, etc.)
 *
 * NEW ENDPOINT for setting static values, generators, etc.
 */
export async function handleUpdateFieldMappingConfig(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const fieldIdValidation = searchIndexFieldIdSchema.safeParse({ 
            fieldId: parseInt(params.fieldId, 10) 
        });
        if (!fieldIdValidation.success) {
            return apiResponse.validationError(fieldIdValidation.error);
        }

        const body = await request.json();
        const bodyValidation = fieldMappingConfigSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Cast to FieldMappingConfig - Zod has already validated the required fields
        const mappingConfig = bodyValidation.data as FieldMappingConfig;

        const field = await fieldsService.updateFieldMappingConfig(
            fieldIdValidation.data.fieldId,
            mappingConfig,
            userId
        );

        logger.info('Updated field mapping config via API', {
            fieldId: field.id,
            searchIndexId: idValidation.data.id,
            mode: mappingConfig.mode,
            userId,
        });

        return apiResponse.success(field);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to update field mapping config', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * PUT /api/search-indexes/:id/fields/mappings
 * Bulk update field mappings (save all mappings at once)
 */
export async function handleBulkUpdateMappings(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();
        const bodyValidation = bulkUpdateFieldMappingsSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Pass validated data directly - Zod ensures correct shape
        const fields = await fieldsService.bulkUpdateMappings(
            idValidation.data.id,
            { mappings: bodyValidation.data.mappings },
            userId
        );

        logger.info('Bulk updated field mappings via API', {
            searchIndexId: idValidation.data.id,
            mappingCount: fields.length,
            userId,
        });

        return apiResponse.success(fields);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to bulk update mappings', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        if (err.message.includes('Duplicate')) {
            return apiResponse.badRequest(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * DELETE /api/search-indexes/:id/fields/mappings
 * Clear all field mappings (reset to unmapped state)
 */
export async function handleClearMappings(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const clearedCount = await fieldsService.clearAllMappings(
            validation.data.id,
            userId
        );

        logger.info('Cleared field mappings via API', {
            searchIndexId: validation.data.id,
            clearedCount,
            userId,
        });

        return apiResponse.success({ 
            message: 'Field mappings cleared successfully',
            clearedCount,
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to clear mappings', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * PUT /api/search-indexes/:id/fields/additional-data
 * Update additionalData field's collect configuration
 * 
 * NEW ENDPOINT for configuring which unmapped fields to collect
 */
export async function handleUpdateAdditionalDataConfig(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const params = await context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const body = await request.json();
        const bodyValidation = additionalDataConfigSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        const field = await fieldsService.updateAdditionalDataConfig(
            idValidation.data.id,
            bodyValidation.data.collectFields,
            userId
        );

        if (!field) {
            return apiResponse.notFound('additionalData field not found for this index');
        }

        logger.info('Updated additionalData config via API', {
            searchIndexId: idValidation.data.id,
            collectFieldsCount: bodyValidation.data.collectFields.length,
            userId,
        });

        return apiResponse.success(field);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to update additionalData config', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/fields/validate
 * Validate field mappings before indexing
 */
export async function handleValidateMappings(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const validation = searchIndexIdSchema.safeParse({ id: params.id });

        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const result = await fieldsService.validateMappings(validation.data.id);

        return apiResponse.success(result);
    } catch (error) {
        logger.error('Failed to validate mappings', error as Error);
        return apiResponse.error(error as Error);
    }
}

// ============================================================================
// BACKWARD COMPATIBILITY: OLD MAPPINGS ENDPOINTS
// ============================================================================

/**
 * GET /api/search-indexes/:id/mappings
 * Get all field mappings for a search index
 * Now forwards to handleGetFields
 */
export async function handleGetFieldMappings(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetFields(request, context);
}

/**
 * PUT /api/search-indexes/:id/mappings
 * Replace all field mappings for a search index
 * Now forwards to handleBulkUpdateMappings
 */
export async function handleReplaceFieldMappings(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleBulkUpdateMappings(request, context);
}

// ============================================================================
// CACHE HANDLERS
// ============================================================================

/**
 * POST /api/search-indexes/cache/clear
 * Clear all search index caches
 */
export async function handleClearCache() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        // Use clearAllCache (correct method name - no 's')
        await service.clearAllCache();

        logger.info('Cleared search index caches via API', { userId });

        return apiResponse.success({ message: 'Caches cleared successfully' });
    } catch (error) {
        logger.error('Failed to clear caches', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * GET /api/search-indexes/cache/stats
 * Get cache statistics
 */
export async function handleGetCacheStats() {
    try {
        const stats = service.getCacheStats();
        return apiResponse.success(stats);
    } catch (error) {
        logger.error('Failed to get cache stats', error as Error);
        return apiResponse.error(error as Error);
    }
}

// ============================================================================
// EXPORT/IMPORT HANDLERS
// ============================================================================

/**
 * GET /api/search-indexes/:id/export
 * Export a search index as JSON
 */
export async function handleExportSearchIndex(
    request: NextRequest,
    context: { params: { id: string } }
) {
    try {
        const userId = await getCurrentUserId();

        const { id } = context.params;
        const idValidation = searchIndexIdSchema.safeParse({ id });

        if (!idValidation.success) {
            return apiResponse.badRequest('Invalid search index ID');
        }

        const exportData = await service.exportSearchIndex(id, userId ?? undefined);

        // Return as JSON with download headers
        const filename = `search-index-${exportData.searchIndex.name}-${Date.now()}.json`;

        return new Response(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        logger.error('Failed to export search index', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * POST /api/search-indexes/import/preview
 * Preview a search index import
 */
export async function handlePreviewImport(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate the import data structure
        const validation = searchIndexExportSchema.safeParse(body);

        if (!validation.success) {
            return apiResponse.badRequest('Invalid import data format');
        }

        const preview = await service.previewSearchIndexImport(validation.data);

        return apiResponse.success(preview);
    } catch (error) {
        logger.error('Failed to preview import', error as Error);
        return apiResponse.error(error as Error);
    }
}

/**
 * POST /api/search-indexes/import
 * Import a search index from JSON
 */
export async function handleImportSearchIndex(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized('You must be logged in');
        }

        const body = await request.json();

        // Validate the full import request
        const validation = searchIndexImportSchema.safeParse(body);

        if (!validation.success) {
            return apiResponse.badRequest('Invalid import data');
        }

        const result = await service.importSearchIndex(validation.data, userId);

        logger.info('Imported search index', {
            userId,
            searchIndexId: result.searchIndexId,
            success: result.success,
        });

        return apiResponse.success(result);
    } catch (error) {
        logger.error('Failed to import search index', error as Error);
        return apiResponse.error(error as Error);
    }
}