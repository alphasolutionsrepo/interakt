import { describe, expect, it } from 'vitest';

import { isUuidShape } from './uuid';

describe('isUuidShape', () => {
  it.each([
    ['a random (v4) UUID', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53'],
    ['uppercase', '3F2B8C1E-5D4A-4B7E-9A1C-2E6F0D8B7A53'],
    ['mixed case', '3f2B8c1E-5d4A-4b7E-9a1C-2e6F0d8B7a53'],
    ['a non-v4 UUID (Postgres takes any 8-4-4-4-12 hex)', '11111111-1111-1111-1111-111111111111'],
    ['the nil UUID', '00000000-0000-0000-0000-000000000000'],
    ['a seeded id with a non-standard variant', '00000000-0000-4000-8000-000000000002'],
  ])('accepts %s', (_, value) => {
    expect(isUuidShape(value)).toBe(true);
  });

  it.each([
    ['one letter', 'x'],
    ['an empty string', ''],
    ['a name', 'not-a-uuid'],
    ['extra characters after', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53x'],
    ['extra characters before', ' 3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53'],
    ['a trailing newline', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53\n'],
    ['no dashes', '3f2b8c1e5d4a4b7e9a1c2e6f0d8b7a53'],
    ['a non-hex digit', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a5g'],
    ['a short last group', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a5'],
    ['braces', '{3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53}'],
  ])('rejects %s', (_, value) => {
    expect(isUuidShape(value)).toBe(false);
  });
});
