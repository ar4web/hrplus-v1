import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev', '.data']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The API payloads are untyped at the boundary and pages read them
      // dynamically; typing every access is a separate refactor. Surfaced as a
      // warning so regressions are still visible without failing the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
      // Data-loading effects legitimately push async results into state.
      'react-hooks/set-state-in-effect': 'warn',
      // Hooks intentionally re-run on derived values in a few places.
      'react-hooks/exhaustive-deps': 'warn',
      // Component files export helpers alongside components by design.
      'react-refresh/only-export-components': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
])
