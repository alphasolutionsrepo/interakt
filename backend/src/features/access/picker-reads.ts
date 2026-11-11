// src/features/access/picker-reads.ts

/**
 * The data source reads a search experience editor's source picker makes: open to anyone in
 * PICKER_READERS.dataSources, but a role that can't view data sources gets them without their
 * connection settings (`config`); the picker needs only the name, type and schema.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { PICKER_READERS } from './permissions';
import { withoutFields } from './redact';
import { checkAccess, SIGNED_IN, withPermission } from './route-guard';
import { can } from './user-access';

const SETTINGS = new Set(['config']);

export function forDataSourcePickers<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return withPermission(PICKER_READERS.dataSources, async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    const { access } = await checkAccess(SIGNED_IN);
    if ((access && can(access, 'data-sources:view')) || !res.headers.get('content-type')?.includes('application/json')) return res;
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return NextResponse.json(withoutFields(await res.json(), SETTINGS), { status: res.status, headers });
  });
}
