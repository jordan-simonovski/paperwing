import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Deliberately small: the rules that catch real runtime bugs, not style.
export default tseslint.config(
  { ignores: ['dist', '.vercel', 'node_modules', 'sw', 'scripts', 'test-results', 'playwright-report'] },
  {
    files: ['src/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
