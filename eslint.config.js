import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Deliberately small: the rules that catch real runtime bugs, not style.
export default tseslint.config(
  { ignores: ['dist', '.vercel', 'node_modules', 'sw', 'scripts', 'test-results', 'playwright-report', '.lighthouseci'] },
  {
    files: ['src/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // The server and the journeys: an unawaited promise is a KV write the function exits before, or a
  // Playwright expect that never runs. (Not src/: router navigate() returns a promise nobody needs.)
  {
    files: ['api/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
)
