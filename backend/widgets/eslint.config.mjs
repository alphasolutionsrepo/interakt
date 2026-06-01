// Flat ESLint config for the widgets mini-package.
// The backend's ESLint config deliberately ignores widgets/** — this package
// lints itself. Browser/DOM globals aren't declared because TypeScript already
// resolves them (so `no-undef` is disabled for TS, per typescript-eslint guidance).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'tests/**', 'coverage/**', '*.config.{js,ts,mjs}'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off', // TypeScript checks identifiers; avoids false positives on DOM globals.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
