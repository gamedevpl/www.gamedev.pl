// IMPORTANT: This file now uses ESM syntax.
// You may need to either:
// 1. Rename this file to `eslint.config.mjs`.
// 2. Add `"type": "module"` to your `package.json`.

import globals from "globals";
import tseslint from "typescript-eslint";
import eslintJs from "@eslint/js";

export default tseslint.config(
  {
    ignores: ["dist/"],
  },
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "prefer-const": "off",
      "no-case-declarations": "off",
      // Warn about unused vars, but allow them if they start with _
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      // Downgrade no-explicit-any to a warning for now
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
