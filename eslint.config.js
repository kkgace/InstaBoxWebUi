import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '*.tmp.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node 环境：server/*.mjs
    files: ['server/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // fetch→setState 是本项目的标准数据加载模式；react-hooks v6+ 的新规则对此过于激进，降为警告
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
);
