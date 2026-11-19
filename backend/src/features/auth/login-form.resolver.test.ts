// src/features/auth/login-form.resolver.test.ts

/**
 * The admin forms show the wording set in shared/validation (zodResolver over a schema built
 * from @/shared/validation/zod), not zod's default English.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { describe, expect, it } from 'vitest';

import { loginSchema } from './auth.validations';

describe('the login form resolver', () => {
  it('shows our "required" wording under a missing field', async () => {
    const result = await zodResolver(loginSchema)({} as never, undefined, { fields: {}, shouldUseNativeValidation: false } as never);

    expect(result.values).toEqual({});
    expect(result.errors).toMatchObject({
      email: { message: 'This field is required.' },
      password: { message: 'This field is required.' },
    });
  });

  it('keeps a message the schema sets itself over ours', async () => {
    const result = await zodResolver(loginSchema)({ email: 'a@b.co', password: '' } as never, undefined, { fields: {}, shouldUseNativeValidation: false } as never);

    expect(result.errors).toMatchObject({ password: { message: 'Password is required' } });
  });
});
