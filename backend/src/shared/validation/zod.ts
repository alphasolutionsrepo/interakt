// src/shared/validation/zod.ts

/**
 * The app's zod. Import z (and zod types) from here, not from 'zod' (lint enforces it): loading
 * this module registers our validation wording (./validation-messages.ts) before any schema runs,
 * on the server and in the browser alike.
 */

import { z } from 'zod';

import { validationMessage } from './validation-messages';

z.config({ customError: validationMessage });

// Everything zod exports (z, ZodError, the types), from here so the line above has run first.
export * from 'zod';
