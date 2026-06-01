// src/features/auth/index.ts

// ============================================================================
// TYPE EXPORTS (Client-safe)
// ============================================================================
export type {
  CreateUserDTO,
  LoginDTO,
  UpdateUserDTO,
  ChangePasswordDTO,
} from './auth.validations';

export type { User } from '@/db/schema/users.schema';

// ============================================================================
// VALIDATION EXPORTS (Client-safe)
// ============================================================================
export {
  createUserSchema,
  loginSchema,
  updateUserSchema,
  changePasswordSchema,
  passwordSchema,
  emailSchema,
} from './auth.validations';

// ============================================================================
// AUTH EXPORTS
// ============================================================================
export { auth, signIn, signOut, handlers } from './auth.api.handlers';

// ============================================================================
// UTILITY EXPORTS
// ============================================================================
export {
  getCurrentUser,
  getCurrentSessionAndUser,
  requireAuth,
  requireRole,
  hashPassword,
  verifyPassword,
  validatePassword,
} from '@/shared/utils/auth-utils';

// Note: Service and repository are NOT exported here (server-only)
// Import them directly when needed:
// import * as authService from '@/features/auth/auth.service';
// import * as authRepository from '@/features/auth/auth.repository';