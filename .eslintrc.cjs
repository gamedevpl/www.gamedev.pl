module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'build', 'coverage', 'node_modules', '*.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: ['plugin:react-hooks/recommended'],
      plugins: ['react-refresh'],
      rules: {
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
