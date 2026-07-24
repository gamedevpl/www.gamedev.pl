// Config for the *legacy* GenAIcode coding agent (1.x), still runnable via
// `npx genaicode@1`. GenAIcode 2.x is no longer a coding agent — it is a backend
// LLM toolkit, and this file means nothing to it. The 2.x library is a runtime
// dependency of `@gamedevpl/api`; see `apps/api/src/genai.ts`.
export default {
  rootDir: '.',
  lintCommand: 'npm run type-check && npm run lint',
  ignorePaths: ['dist', 'build', 'coverage', 'node_modules', 'package-lock.json'],
};
