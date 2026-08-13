import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'build/**',
    'dist/**',
    'node_modules/**',
    'scratch/**',
    'claude-usage-widget-main/**',
    'next-env.d.ts',
    'deepseek-dump.json',
    'ds-login.html',
    'test-deepseek.js',
  ]),
]);
