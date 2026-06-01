import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import importPlugin from "eslint-plugin-import";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

// Create a TypeScript parser configuration
const typescriptParser = tseslint.parser;

export default defineConfig([
  // Global ignores — a config object with only `ignores` applies project-wide.
  // The widgets/ mini-package has its own build + linting; backend ESLint must not touch it.
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/build/**",
      "**/.vercel/**",
      "**/drizzle/**",
      "**/lib/drizzle/**",
      "widgets/**",
      "**/public/embed/**", // generated widget bundle copied from widgets/dist — not source
      "scripts/**",         // dev tooling; excluded from tsconfig too, so not typed-lintable
    ],
  },

  // Base JS/TS configuration
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    ignores: [
      "**/components/ui/**",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: true,
      noInlineConfig: false,
    },
  },
  
  // JavaScript rules
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    rules: js.configs.recommended.rules,
  },
  
  // TypeScript rules
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaFeatures: {
          jsx: true,
        },
        skipLibCheck: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "unused-imports": unusedImports,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // unused-imports auto-removes dead imports on --fix; the TS rule isn't fixable.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      // Unused *imports* are auto-removed (error). Unused locals/args are a
      // warning — common policy, and avoids gating CI on cosmetic dead vars.
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  
  // React rules
  {
    files: ["**/*.{jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        React: true,
        JSX: true,
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...pluginReact.configs.recommended.rules,
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      // Registered so the existing inline disable directives resolve; new
      // dependency-array issues surface as warnings rather than hard errors.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Custom hooks also live in plain .ts files — register react-hooks there too
  // so their inline disable directives resolve and deps issues warn (not error).
  {
    files: ["**/*.ts"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  
  // Import ordering rules
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/order": [
        "warn",
        {
          "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          "alphabetize": {
            "order": "asc",
            "caseInsensitive": true
          }
        }
      ],
      "import/no-duplicates": "error",
    },
  },
  
  // Common code style rules
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    rules: {
      "no-console": ["warn", { "allow": ["warn", "error", "info"] }],
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always", { "null": "ignore" }],
    },
  },

  // Isolation guard: nothing in backend/src may import from the widgets package.
  // Widgets are a standalone Preact bundle; their only crossing into the backend
  // is the built artifact in /public/embed/v1/.
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../widgets/*", "../../widgets/*", "../../../widgets/*"],
              message:
                "Do not import from backend/widgets. The widgets package is isolated; its only crossing is the built bundle copied to public/embed/v1/.",
            },
          ],
        },
      ],
    },
  },
  
  // Config file exceptions
  {
    files: ["*.config.{js,ts,mjs}", "next.config.*", "drizzle.config.*"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
      "import/no-default-export": "off",
    },
  },
  
  // Next.js rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules
    }
  },

  // TypeScript supersedes these base rules: the TS compiler resolves identifiers
  // (so base `no-undef` only yields false positives) and unused vars/imports are
  // handled by the unused-imports plugin above. Keep this LAST so it wins.
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
]);
