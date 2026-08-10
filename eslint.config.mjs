import js from '@eslint/js';

/**
 * Flat config. Deliberately small: the type checker (`npm run typecheck`) carries the
 * heavy load, so lint is here for style and the obvious errors CLAUDE.md names.
 *
 * The `globals` package would be a fifth dependency for a list of six names, so the
 * Node globals this repo actually uses are declared inline.
 */
export default [
  { ignores: ['node_modules/**', 'test/fixtures/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        NodeJS: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
