// src/features/document-indexing/document-actor.ts

/**
 * Document Actor
 *
 * Resolves who is making a document request: a logged-in admin user, or an
 * external system holding an ingestion key.
 *
 * The document endpoints serve both. Keeping the resolution in one place means
 * every handler enforces the same rules, and the resulting actor is what gets
 * recorded in the audit trail — so an operation can always be attributed.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import {
    authenticateIngestionKey,
    hasBearerCredentials,
    type IngestionOperation,
} from '@/features/ingestion-keys';

// ============================================================================
// TYPES
// ============================================================================

export type DocumentActor =
    | { type: 'user'; userId: string }
    | {
        type: 'key';
        keyId: string;
        keyName: string;
        /** Operations this key was granted, for endpoints that can't know their
         *  requirement until the body is parsed (see actorCan). */
        grantedOperations: IngestionOperation[];
    };

export interface ActorResolved {
    actor: DocumentActor;
    response?: undefined;
}

export interface ActorRejected {
    actor?: undefined;
    response: NextResponse;
}

export type ActorResult = ActorResolved | ActorRejected;

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolve the actor behind a document request.
 *
 * If an `Authorization: Bearer` header is present the request is treated as an
 * ingestion-key attempt and **does not fall back to the session**. Falling back
 * would turn a wrong or revoked key into a confusing "unauthorized" about
 * cookies, and would let a browser with an admin session mask a broken
 * server-to-server credential.
 *
 * @param requirement.operation - required for mutating endpoints. Omit for reads;
 *   a key scoped to the index may read from it.
 */
export async function resolveDocumentActor(
    request: NextRequest,
    requirement: { searchIndexId: string; operation?: IngestionOperation }
): Promise<ActorResult> {
    if (hasBearerCredentials(request)) {
        const result = await authenticateIngestionKey(request, requirement);

        if (!result.success) {
            return { response: result.response };
        }

        return {
            actor: {
                type: 'key',
                keyId: result.key.id,
                keyName: result.key.name,
                grantedOperations: result.key.operations ?? [],
            },
        };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
        return { response: apiResponse.unauthorized() };
    }

    return { actor: { type: 'user', userId } };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Whether an actor may perform an operation.
 *
 * For endpoints whose requirement depends on the request body — a bulk write
 * carrying deletes needs `delete` as well as `write` — authenticate first for
 * identity and index scope, then check each operation the body actually asks for.
 * Doing it the other way round would leak schema detail to unauthenticated
 * callers via validation errors.
 *
 * An admin session is not operation-scoped, so a user actor may do anything the
 * endpoint offers.
 */
export function actorCan(actor: DocumentActor, operation: IngestionOperation): boolean {
    return actor.type === 'user' || actor.grantedOperations.includes(operation);
}

/**
 * Actor fields for a log line, so an operation is attributable without every
 * call site destructuring the union.
 */
export function actorLogContext(actor: DocumentActor): Record<string, unknown> {
    return actor.type === 'user'
        ? { actorType: 'user', actorId: actor.userId }
        : { actorType: 'key', actorId: actor.keyId, actorName: actor.keyName };
}

/**
 * Split an actor into the two audit columns on indexing_batches.
 *
 * Exactly one is ever set, which is what makes a machine upload
 * distinguishable from the unauthenticated writes this replaced.
 */
export function actorAuditColumns(actor: DocumentActor): {
    createdBy?: string;
    createdByKeyId?: string;
} {
    return actor.type === 'user'
        ? { createdBy: actor.userId }
        : { createdByKeyId: actor.keyId };
}
