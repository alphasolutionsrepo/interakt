// src/features/auth/auth.api.handlers.ts

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserForAuth } from './auth.service';
import { verifyPassword } from '@/shared/utils/auth-utils';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('auth');

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // ✅ Use real service function
          const user = await getUserForAuth(credentials.email as string);

          if (!user || !user.isActive || !user.password) {
            return null;
          }

          const isPasswordValid = await verifyPassword(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
            firstName: user.firstName ?? '',
            lastName: user.lastName ?? '',
            role: user.role ?? 'user',
          };
        } catch (error) {
          logger.error('Authentication error', error as Error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionId = uuidv4();
        token.name = user.name;
        token.email = user.email;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (!session.user) {
        session.user = {} as any;
      }

      session.sessionId = token.sessionId as string;
      session.user.id = token.sub as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.email = token.email as string;
      session.user.role = token.role as string;
      session.user.name = token.name as string;

      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/error'
  }
});