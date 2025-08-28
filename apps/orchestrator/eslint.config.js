const tsEslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  // Configuration for non-test TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
      },
      globals: {
        es2021: true,
        node: true,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
      'import': importPlugin,
    },
    rules: {
      ...tsEslint.configs.recommended.rules,
      'import/order': ['warn', { 
        'newlines-between': 'always', 
        'alphabetize': { 'order': 'asc', 'caseInsensitive': true } 
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    },
  },
  // Configuration for test files (without project references)
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
      globals: {
        es2021: true,
        node: true,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
      'import': importPlugin,
    },
    rules: {
      ...tsEslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in tests
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];