// src/features/access/constraint-errors.test.ts

import { describe, expect, it } from 'vitest';

import { conflictOnConstraint } from './constraint-errors';

describe('a write that races another request', () => {
  const messages = { unique: 'Name taken', foreignKey: 'Role gone' };

  it('answers a unique or foreign-key violation as 409, whether the code is on the error or its cause', async () => {
    await expect(conflictOnConstraint(async () => { throw Object.assign(new Error('dup'), { code: '23505' }); }, messages))
      .rejects.toMatchObject({ status: 409, message: 'Name taken' });
    await expect(conflictOnConstraint(async () => { throw new Error('fk', { cause: { code: '23503' } }); }, messages))
      .rejects.toMatchObject({ status: 409, message: 'Role gone' });
  });

  it('passes other errors through, and results through', async () => {
    const other = Object.assign(new Error('down'), { code: '08006' });
    await expect(conflictOnConstraint(async () => { throw other; }, messages)).rejects.toBe(other);
    await expect(conflictOnConstraint(async () => 7, messages)).resolves.toBe(7);
  });
});
