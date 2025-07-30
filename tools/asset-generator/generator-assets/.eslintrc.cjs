module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    'prefer-const': 'off',
    'no-case-declarations': 'off',
  },
  parserOptions: {
    warnOnUnsupportedTypeScriptVersion: false,
  },
};
