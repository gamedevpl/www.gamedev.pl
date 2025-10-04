import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', '.eslintrc.cjs', 'eslint.config.js'],
  },
  {
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      'prefer-const': 'off',
      'no-case-declarations': 'off',
    },
  },
);
