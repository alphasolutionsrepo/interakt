// Importing the module is what turns the `declare module` blocks below into
// augmentations (merging with next-auth's types) rather than overrides. The
// binding is intentionally unused.
// eslint-disable-next-line unused-imports/no-unused-imports
import NextAuth from 'next-auth'

declare module 'next-auth' {
    interface Session {
        sessionId: string
        user: {
            id: string
            email: string
            name: string
            firstName: string
            lastName: string
            role: string
        }
    }

    interface User {
        id: string
        email: string
        name: string
        firstName: string
        lastName: string
        role: string
    }
}

// For NextAuth v5, use '@auth/core/jwt' instead
declare module '@auth/core/jwt' {
    interface JWT {
        sessionId: string
        firstName: string
        lastName: string
        role: string
    }
}