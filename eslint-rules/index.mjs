/** Combines the repo's local ESLint rules into one plugin object for eslint.config.js. */
import relativeImportExtensions from './relative-import-extensions.mjs';
import moduleBoundary from './module-boundary.mjs';

export default {
  rules: {
    ...relativeImportExtensions.rules,
    ...moduleBoundary.rules,
  },
};
