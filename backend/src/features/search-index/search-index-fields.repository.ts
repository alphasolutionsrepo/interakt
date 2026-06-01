// src/features/search-index/search-index-fields.repository.ts

/**
 * Search Index Fields - Repository Layer
 * 
 * Database operations for search_index_fields table.
 * Handles field snapshots, mappings, and configuration.
 * 
 * UPDATED: Supports new FieldMappingConfig structure
 */

import { db } from '@/db/index';
import { searchIndexFields } from '@/db/schema/search-index-fields.schema';
import type { SearchIndexField, NewSearchIndexField } from '@/db/schema/search-index-fields.schema';
import { eq, and, count, asc, desc, sql } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import type { FieldMappingConfig } from '@/shared/constants/search-index.constants';

const logger = createLogger('search-index-fields-repository');

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a single search index field
 */
export async function createField(
    data: Omit<NewSearchIndexField, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SearchIndexField> {
    try {
        const [created] = await db
            .insert(searchIndexFields)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        logger.info('Created search index field', {
            fieldId: created.id,
            searchIndexId: created.searchIndexId,
            fieldName: created.fieldName,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create search index field', error as Error, {
            searchIndexId: data.searchIndexId,
            fieldName: data.fieldName,
        });
        throw error;
    }
}

/**
 * Bulk create fields (used when snapshotting template fields)
 */
export async function createFields(
    fields: Array<Omit<NewSearchIndexField, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<SearchIndexField[]> {
    if (fields.length === 0) {
        return [];
    }

    try {
        const now = new Date();
        const fieldsWithTimestamps = fields.map(f => ({
            ...f,
            createdAt: now,
            updatedAt: now,
        }));

        const created = await db
            .insert(searchIndexFields)
            .values(fieldsWithTimestamps)
            .returning();

        logger.info('Bulk created search index fields', {
            count: created.length,
            searchIndexId: fields[0].searchIndexId,
        });

        return created;
    } catch (error) {
        logger.error('Failed to bulk create fields', error as Error);
        throw error;
    }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all fields for a search index
 */
export async function getFieldsBySearchIndexId(
    searchIndexId: string
): Promise<SearchIndexField[]> {
    try {
        const fields = await db
            .select()
            .from(searchIndexFields)
            .where(eq(searchIndexFields.searchIndexId, searchIndexId))
            .orderBy(
                desc(searchIndexFields.isSystemField),
                asc(searchIndexFields.fieldName)
            );

        return fields;
    } catch (error) {
        logger.error('Failed to get fields by search index ID', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Get a single field by ID
 */
export async function getFieldById(id: number): Promise<SearchIndexField | null> {
    try {
        const [field] = await db
            .select()
            .from(searchIndexFields)
            .where(eq(searchIndexFields.id, id))
            .limit(1);

        return field ?? null;
    } catch (error) {
        logger.error('Failed to get field by ID', error as Error, { id });
        throw error;
    }
}

/**
 * Get mapped fields only
 */
export async function getMappedFields(searchIndexId: string): Promise<SearchIndexField[]> {
    try {
        return await db
            .select()
            .from(searchIndexFields)
            .where(and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.isMapped, true)
            ))
            .orderBy(asc(searchIndexFields.fieldName));
    } catch (error) {
        logger.error('Failed to get mapped fields', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Get unmapped fields only
 */
export async function getUnmappedFields(searchIndexId: string): Promise<SearchIndexField[]> {
    try {
        return await db
            .select()
            .from(searchIndexFields)
            .where(and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.isMapped, false)
            ))
            .orderBy(asc(searchIndexFields.fieldName));
    } catch (error) {
        logger.error('Failed to get unmapped fields', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Get vector source fields (for embedding generation)
 */
export async function getVectorSourceFields(searchIndexId: string): Promise<SearchIndexField[]> {
    try {
        return await db
            .select()
            .from(searchIndexFields)
            .where(and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.isVectorSource, true)
            ))
            .orderBy(asc(searchIndexFields.fieldName));
    } catch (error) {
        logger.error('Failed to get vector source fields', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Get field counts for summary
 */
export async function countFields(searchIndexId: string): Promise<{
    total: number;
    mapped: number;
    unmapped: number;
    required: number;
    requiredMapped: number;
    system: number;
    vectorSource: number;
}> {
    try {
        const fields = await getFieldsBySearchIndexId(searchIndexId);

        return {
            total: fields.length,
            mapped: fields.filter(f => f.isMapped).length,
            unmapped: fields.filter(f => !f.isMapped).length,
            required: fields.filter(f => f.isRequired).length,
            requiredMapped: fields.filter(f => f.isRequired && f.isMapped).length,
            system: fields.filter(f => f.isSystemField).length,
            vectorSource: fields.filter(f => f.isVectorSource).length,
        };
    } catch (error) {
        logger.error('Failed to count fields', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Check if a field name exists in an index
 */
export async function fieldNameExists(
    searchIndexId: string,
    fieldName: string,
    excludeFieldId?: number
): Promise<boolean> {
    try {
        const conditions = excludeFieldId
            ? and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.fieldName, fieldName),
                sql`${searchIndexFields.id} != ${excludeFieldId}`
            )
            : and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.fieldName, fieldName)
            );

        const [result] = await db
            .select({ count: count() })
            .from(searchIndexFields)
            .where(conditions);

        return Number(result.count) > 0;
    } catch (error) {
        logger.error('Failed to check field name existence', error as Error);
        throw error;
    }
}

/**
 * Check if a source field is already mapped (for duplicate detection)
 */
export async function sourceFieldExists(
    searchIndexId: string,
    sourceFieldName: string,
    excludeFieldId?: number
): Promise<boolean> {
    try {
        const conditions = excludeFieldId
            ? and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.sourceFieldName, sourceFieldName),
                sql`${searchIndexFields.id} != ${excludeFieldId}`
            )
            : and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.sourceFieldName, sourceFieldName)
            );

        const [result] = await db
            .select({ count: count() })
            .from(searchIndexFields)
            .where(conditions);

        return Number(result.count) > 0;
    } catch (error) {
        logger.error('Failed to check source field existence', error as Error);
        throw error;
    }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a single field
 */
export async function updateField(
    id: number,
    updates: Partial<Omit<NewSearchIndexField, 'id' | 'searchIndexId' | 'createdAt'>>
): Promise<SearchIndexField> {
    try {
        const [updated] = await db
            .update(searchIndexFields)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(searchIndexFields.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index field with ID ${id} not found`);
        }

        logger.info('Updated search index field', {
            fieldId: id,
            updates: Object.keys(updates),
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update search index field', error as Error, { id });
        throw error;
    }
}

/**
 * Update field mapping (set source field and optionally mappingConfig)
 */
export async function updateFieldMapping(
    id: number,
    sourceFieldName: string | null,
    sourceFieldPath?: string | null,
    mappingConfig?: FieldMappingConfig
): Promise<SearchIndexField> {
    try {
        // Determine if field will be mapped and indexed
        const willBeMapped = sourceFieldName !== null ||
            (mappingConfig?.mode === 'static' && mappingConfig.staticValue !== undefined) ||
            (mappingConfig?.mode === 'generated' && !!mappingConfig.generator) ||
            (mappingConfig?.mode === 'default' && (mappingConfig.staticValue !== undefined || !!mappingConfig.generator)) ||
            (mappingConfig?.mode === 'reference' && !!mappingConfig.sourceFromField) ||
            mappingConfig?.mode === 'computed' ||
            mappingConfig?.mode === 'collect';

        // Fields with mode='none' are skipped during indexing
        const willBeIndexed = mappingConfig?.mode !== 'none' && willBeMapped;

        const updateData: Partial<NewSearchIndexField> = {
            sourceFieldName,
            sourceFieldPath: sourceFieldPath ?? null,
            isMapped: !!willBeMapped,
            isIndexed: !!willBeIndexed,
            updatedAt: new Date(),
        };

        // If mappingConfig is provided, store it in transformConfig column
        if (mappingConfig) {
            updateData.transformConfig = mappingConfig as unknown as NewSearchIndexField['transformConfig'];
        }

        const [updated] = await db
            .update(searchIndexFields)
            .set(updateData)
            .where(eq(searchIndexFields.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index field with ID ${id} not found`);
        }

        logger.info('Updated field mapping', {
            fieldId: id,
            sourceFieldName,
            isMapped: sourceFieldName !== null,
            hasMappingConfig: !!mappingConfig,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update field mapping', error as Error, { id });
        throw error;
    }
}

/**
 * Update field's mapping configuration only (without changing source)
 */
export async function updateFieldMappingConfig(
    id: number,
    mappingConfig: FieldMappingConfig
): Promise<SearchIndexField> {
    try {
        // Determine if field should be considered "mapped" based on config mode
        // Fields with these modes don't need a source field to produce a value
        const isMappedByConfig = ['static', 'generated', 'computed', 'collect'].includes(mappingConfig.mode)
            || (mappingConfig.mode === 'reference' && !!mappingConfig.sourceFromField)
            || (mappingConfig.mode === 'default' && (mappingConfig.staticValue !== undefined || !!mappingConfig.generator));

        // Fields with mode='none' are skipped during indexing
        const isIndexedByConfig = mappingConfig.mode !== 'none' && isMappedByConfig;

        const [updated] = await db
            .update(searchIndexFields)
            .set({
                transformConfig: mappingConfig as unknown as NewSearchIndexField['transformConfig'],
                // If mode doesn't require source, mark as mapped
                isMapped: isMappedByConfig ? true : undefined,
                // If mode is 'none', mark as not indexed
                isIndexed: mappingConfig.mode === 'none' ? false : (isIndexedByConfig ? true : undefined),
                updatedAt: new Date(),
            })
            .where(eq(searchIndexFields.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index field with ID ${id} not found`);
        }

        logger.info('Updated field mapping config', {
            fieldId: id,
            mode: mappingConfig.mode,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update field mapping config', error as Error, { id });
        throw error;
    }
}

/**
 * Bulk update field mappings
 * Used when saving all mappings at once from the UI
 * 
 * UPDATED: Now supports mappingConfig which is saved to transformConfig column
 */
export async function bulkUpdateMappings(
    searchIndexId: string,
    mappings: Array<{
        fieldId: number;
        sourceFieldName: string | null;
        sourceFieldPath?: string | null;
        mappingConfig?: FieldMappingConfig;
        isVectorSource?: boolean;
    }>
): Promise<SearchIndexField[]> {
    if (mappings.length === 0) {
        return [];
    }

    try {
        const results: SearchIndexField[] = [];

        // Update each field in a transaction
        await db.transaction(async (tx) => {
            for (const mapping of mappings) {
                // Determine if field will be mapped (has a data source)
                const willBeMapped = mapping.sourceFieldName !== null ||
                    (mapping.mappingConfig?.mode === 'static' && mapping.mappingConfig.staticValue !== undefined) ||
                    (mapping.mappingConfig?.mode === 'generated' && mapping.mappingConfig.generator) ||
                    mapping.mappingConfig?.mode === 'computed' ||
                    mapping.mappingConfig?.mode === 'collect' ||
                    (mapping.mappingConfig?.mode === 'reference' && mapping.mappingConfig.sourceFromField);

                // Determine if field will actually be indexed
                // Fields with mode='none' are skipped during indexing
                const willBeIndexed = mapping.mappingConfig?.mode !== 'none' && willBeMapped;

                // Build the update object dynamically
                const updateData: Record<string, unknown> = {
                    sourceFieldName: mapping.sourceFieldName,
                    sourceFieldPath: mapping.sourceFieldPath ?? null,
                    isMapped: willBeMapped,
                    isIndexed: willBeIndexed,
                    updatedAt: new Date(),
                };

                // Add transformConfig if mappingConfig is provided
                if (mapping.mappingConfig) {
                    updateData.transformConfig = mapping.mappingConfig;
                }

                // Add isVectorSource if provided
                if (mapping.isVectorSource !== undefined) {
                    updateData.isVectorSource = mapping.isVectorSource;
                }

                const [updated] = await tx
                    .update(searchIndexFields)
                    .set(updateData)
                    .where(and(
                        eq(searchIndexFields.id, mapping.fieldId),
                        eq(searchIndexFields.searchIndexId, searchIndexId)
                    ))
                    .returning();

                if (updated) {
                    results.push(updated);
                }
            }
        });

        logger.info('Bulk updated field mappings', {
            searchIndexId,
            updatedCount: results.length,
        });

        return results;
    } catch (error) {
        logger.error('Failed to bulk update mappings', error as Error, { searchIndexId });
        throw error;
    }
}
/**
 * Clear all mappings for an index (reset to unmapped state)
 * Preserves system field defaults
 */
export async function clearAllMappings(searchIndexId: string): Promise<number> {
    try {
        const result = await db
            .update(searchIndexFields)
            .set({
                sourceFieldName: null,
                sourceFieldPath: null,
                isMapped: false,
                updatedAt: new Date(),
            })
            .where(and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.isSystemField, false)
            ))
            .returning();

        logger.info('Cleared all field mappings', {
            searchIndexId,
            clearedCount: result.length,
        });

        return result.length;
    } catch (error) {
        logger.error('Failed to clear mappings', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Update additionalData field's collect configuration
 */
export async function updateAdditionalDataConfig(
    searchIndexId: string,
    collectFields: string[]
): Promise<SearchIndexField | null> {
    try {
        const [additionalDataField] = await db
            .select()
            .from(searchIndexFields)
            .where(and(
                eq(searchIndexFields.searchIndexId, searchIndexId),
                eq(searchIndexFields.fieldName, 'additionalData')
            ))
            .limit(1);

        if (!additionalDataField) {
            logger.warn('additionalData field not found', { searchIndexId });
            return null;
        }

        const mappingConfig: FieldMappingConfig = {
            mode: 'collect',
            collectFields,
            transform: 'none',
        };

        const [updated] = await db
            .update(searchIndexFields)
            .set({
                transformConfig: mappingConfig as unknown as NewSearchIndexField['transformConfig'],
                isMapped: collectFields.length > 0,
                updatedAt: new Date(),
            })
            .where(eq(searchIndexFields.id, additionalDataField.id))
            .returning();

        logger.info('Updated additionalData config', {
            searchIndexId,
            collectFieldsCount: collectFields.length,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update additionalData config', error as Error, { searchIndexId });
        throw error;
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a single field
 */
export async function deleteField(id: number): Promise<void> {
    try {
        await db
            .delete(searchIndexFields)
            .where(eq(searchIndexFields.id, id));

        logger.info('Deleted search index field', { fieldId: id });
    } catch (error) {
        logger.error('Failed to delete field', error as Error, { id });
        throw error;
    }
}

/**
 * Delete all fields for a search index
 */
export async function deleteFieldsBySearchIndexId(searchIndexId: string): Promise<number> {
    try {
        const result = await db
            .delete(searchIndexFields)
            .where(eq(searchIndexFields.searchIndexId, searchIndexId))
            .returning();

        logger.info('Deleted all fields for search index', {
            searchIndexId,
            deletedCount: result.length,
        });

        return result.length;
    } catch (error) {
        logger.error('Failed to delete fields by search index ID', error as Error, { searchIndexId });
        throw error;
    }
}