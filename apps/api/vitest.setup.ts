/**
 * Suite-wide safety env, applied before any test module loads.
 *
 * TRANSLATE_BUILD_LOG=false: without it, any code path that calls
 * `createTranslatorFromEnv()` builds a real `VertexTranslator`, and on a developer
 * machine with application-default credentials that reaches live Vertex and spends
 * money. This is not hypothetical — it was found while wiring intake-time translation:
 * a test asserting that no translation had happened passed while quietly making a
 * billed API call, returning Polish nobody had stubbed.
 *
 * Tests that want to observe translation inject their own stub `translator`; tests that
 * do not should never be able to reach the network by omission. Set it here rather than
 * branching on NODE_ENV inside the module, so production code has one contract and the
 * suite states its own requirements.
 */
process.env.TRANSLATE_BUILD_LOG ??= 'false';
