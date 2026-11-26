import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Correctness-focused lint. Formatting is Prettier's job; this catches the
 * mistakes the type checker cannot: unused bindings, hook order, accidental
 * `any` leakage is tolerated because the API surface is deliberately dynamic.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.worktrees/**',
      'dist*/**',
      '.expo/**',
      'modules/copper-pty/**',
      'scripts/**',
      'public/**',
      'babel.config.js',
      'metro.config.js',
      'app.config.js',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': 'off',
      'no-undef': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
