import { describe, it, expect } from 'vitest';
import {
    documentIdParamSchema,
    writeDocumentRequestSchema,
    bulkWriteOperationSchema,
    bulkWriteRequestSchema,
    deleteByFilterRequestSchema,
    listDocumentsQuerySchema,
} from './document-indexing.types';

// ============================================================================
// HELPERS
// ============================================================================

function uploadOperation(overrides: Record<string, unknown> = {}) {
    return {
        action: 'upload',
        document: { sku: 'SKU-1', name: 'Widget' },
        ...overrides,
    };
}

function mergeOperation(overrides: Record<string, unknown> = {}) {
    return {
        action: 'merge',
        documentId: 'SKU-1',
        document: { price: 42 },
        ...overrides,
    };
}

function deleteOperation(overrides: Record<string, unknown> = {}) {
    return {
        action: 'delete',
        documentId: 'SKU-1',
        ...overrides,
    };
}

// ============================================================================
// DOCUMENT ID PARAM
// ============================================================================

describe('documentIdParamSchema', () => {
    it('accepts a non-UUID source-system id', () => {
        // Document keys come from the mapped uniqueId field, commonly a SKU
        const result = documentIdParamSchema.safeParse({ documentId: 'SKU-10432' });
        expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
        const result = documentIdParamSchema.safeParse({ documentId: '' });
        expect(result.success).toBe(false);
    });

    it('rejects an id longer than 1024 characters', () => {
        const result = documentIdParamSchema.safeParse({ documentId: 'x'.repeat(1025) });
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// SINGLE DOCUMENT WRITE
// ============================================================================

describe('writeDocumentRequestSchema', () => {
    it('accepts a document body', () => {
        const result = writeDocumentRequestSchema.safeParse({
            document: { sku: 'SKU-1', price: 42 },
        });
        expect(result.success).toBe(true);
    });

    it('accepts an empty document object', () => {
        // A PATCH that only bumps updatedAt is legitimate
        const result = writeDocumentRequestSchema.safeParse({ document: {} });
        expect(result.success).toBe(true);
    });

    it('rejects a missing document', () => {
        const result = writeDocumentRequestSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rejects a non-object document', () => {
        const result = writeDocumentRequestSchema.safeParse({ document: 'not-an-object' });
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// BULK WRITE OPERATIONS
// ============================================================================

describe('bulkWriteOperationSchema', () => {
    it('accepts an upload without a documentId', () => {
        // The id falls back to the mapped uniqueId field
        const result = bulkWriteOperationSchema.safeParse(uploadOperation());
        expect(result.success).toBe(true);
    });

    it('accepts an upload with an explicit documentId', () => {
        const result = bulkWriteOperationSchema.safeParse(
            uploadOperation({ documentId: 'SKU-1' })
        );
        expect(result.success).toBe(true);
    });

    it('accepts a merge', () => {
        const result = bulkWriteOperationSchema.safeParse(mergeOperation());
        expect(result.success).toBe(true);
    });

    it('accepts a delete', () => {
        const result = bulkWriteOperationSchema.safeParse(deleteOperation());
        expect(result.success).toBe(true);
    });

    it('rejects a delete without a documentId', () => {
        // Nothing to derive the key from — a delete must name its target
        const result = bulkWriteOperationSchema.safeParse({ action: 'delete' });
        expect(result.success).toBe(false);
    });

    it('rejects a delete with an empty documentId', () => {
        const result = bulkWriteOperationSchema.safeParse(
            deleteOperation({ documentId: '' })
        );
        expect(result.success).toBe(false);
    });

    it('rejects a merge without a document', () => {
        const result = bulkWriteOperationSchema.safeParse({
            action: 'merge',
            documentId: 'SKU-1',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an upload without a document', () => {
        const result = bulkWriteOperationSchema.safeParse({ action: 'upload' });
        expect(result.success).toBe(false);
    });

    it('rejects an unknown action', () => {
        const result = bulkWriteOperationSchema.safeParse({
            action: 'replace',
            document: { sku: 'SKU-1' },
        });
        expect(result.success).toBe(false);
    });
});

describe('bulkWriteRequestSchema', () => {
    it('accepts a mixed batch', () => {
        const result = bulkWriteRequestSchema.safeParse({
            operations: [uploadOperation(), mergeOperation(), deleteOperation()],
        });
        expect(result.success).toBe(true);
    });

    it('rejects an empty operations array', () => {
        const result = bulkWriteRequestSchema.safeParse({ operations: [] });
        expect(result.success).toBe(false);
    });

    it('rejects more than 10000 operations', () => {
        // Cap matches elasticsearchConfig.indexing.maxDocumentsPerUpload
        const result = bulkWriteRequestSchema.safeParse({
            operations: Array.from({ length: 10001 }, () => deleteOperation()),
        });
        expect(result.success).toBe(false);
    });

    it('accepts exactly 10000 operations', () => {
        const result = bulkWriteRequestSchema.safeParse({
            operations: Array.from({ length: 10000 }, () => deleteOperation()),
        });
        expect(result.success).toBe(true);
    });

    it('rejects a batch containing one invalid operation', () => {
        const result = bulkWriteRequestSchema.safeParse({
            operations: [uploadOperation(), { action: 'delete' }],
        });
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// DELETE BY FILTER
// ============================================================================

describe('deleteByFilterRequestSchema', () => {
    it('accepts a single filter clause', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ field: 'status', operator: 'eq', value: 'discontinued' }],
        });
        expect(result.success).toBe(true);
    });

    it('defaults dryRun to false', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ field: 'status', operator: 'eq', value: 'discontinued' }],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.dryRun).toBe(false);
        }
    });

    it('accepts dryRun true', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ field: 'status', operator: 'eq', value: 'discontinued' }],
            dryRun: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.dryRun).toBe(true);
        }
    });

    it('accepts an operator that takes no value', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ field: 'discontinuedAt', operator: 'exists' }],
        });
        expect(result.success).toBe(true);
    });

    it('rejects an empty filters array', () => {
        // An empty filter would match the whole index
        const result = deleteByFilterRequestSchema.safeParse({ filters: [] });
        expect(result.success).toBe(false);
    });

    it('rejects a missing filters key', () => {
        const result = deleteByFilterRequestSchema.safeParse({ dryRun: true });
        expect(result.success).toBe(false);
    });

    it('rejects a clause with no field', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ operator: 'eq', value: 'discontinued' }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects an unknown operator', () => {
        const result = deleteByFilterRequestSchema.safeParse({
            filters: [{ field: 'status', operator: 'roughly_equals', value: 'x' }],
        });
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// DELETE BY FILTER — PREVIEW SAMPLE SIZE
// ============================================================================

describe('deleteByFilterRequestSchema — sampleSize', () => {
    const filters = [{ field: 'status', operator: 'eq', value: 'discontinued' }];

    it('defaults to 25', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sampleSize).toBe(25);
        }
    });

    it('accepts 0 to skip the sample fetch', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters, sampleSize: 0 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sampleSize).toBe(0);
        }
    });

    it('accepts the 50 ceiling', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters, sampleSize: 50 });
        expect(result.success).toBe(true);
    });

    it('rejects above the ceiling', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters, sampleSize: 51 });
        expect(result.success).toBe(false);
    });

    it('rejects a negative sample size', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters, sampleSize: -1 });
        expect(result.success).toBe(false);
    });

    it('rejects a fractional sample size', () => {
        const result = deleteByFilterRequestSchema.safeParse({ filters, sampleSize: 2.5 });
        expect(result.success).toBe(false);
    });
});

// ============================================================================
// BROWSE / LIST QUERY
// ============================================================================

describe('listDocumentsQuerySchema', () => {
    it('defaults to page 1 with 25 per page', () => {
        const result = listDocumentsQuerySchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ page: 1, pageSize: 25 });
        }
    });

    it('coerces numeric strings from the query string', () => {
        // Values arrive as strings off the URL, never as numbers
        const result = listDocumentsQuerySchema.safeParse({ page: '2', pageSize: '50' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ page: 2, pageSize: 50 });
        }
    });

    it('treats absent params as defaults', () => {
        const result = listDocumentsQuerySchema.safeParse({ page: undefined, pageSize: undefined });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ page: 1, pageSize: 25 });
        }
    });

    it('rejects page 0', () => {
        const result = listDocumentsQuerySchema.safeParse({ page: '0' });
        expect(result.success).toBe(false);
    });

    it('rejects a negative page', () => {
        const result = listDocumentsQuerySchema.safeParse({ page: '-3' });
        expect(result.success).toBe(false);
    });

    it('rejects a pageSize above 100', () => {
        const result = listDocumentsQuerySchema.safeParse({ pageSize: '101' });
        expect(result.success).toBe(false);
    });

    it('accepts the 100 pageSize ceiling', () => {
        const result = listDocumentsQuerySchema.safeParse({ pageSize: '100' });
        expect(result.success).toBe(true);
    });

    it('rejects a non-numeric page', () => {
        const result = listDocumentsQuerySchema.safeParse({ page: 'abc' });
        expect(result.success).toBe(false);
    });

    it('rejects a fractional pageSize', () => {
        const result = listDocumentsQuerySchema.safeParse({ pageSize: '12.5' });
        expect(result.success).toBe(false);
    });
});
