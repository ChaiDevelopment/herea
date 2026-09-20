import js from '@eslint/js';
export default [
  { ignores: ['dist/**', 'src/**', 'health-engine/**', 'tests/**', 'scripts/**', 'data/**', 'node_modules/**'] },
  {
    files: ['public/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      globals: { document: 'readonly', localStorage: 'readonly', fetch: 'readonly', alert: 'readonly', confirm: 'readonly', location: 'readonly', window: 'readonly', Intl: 'readonly' },
    },
  },
];
