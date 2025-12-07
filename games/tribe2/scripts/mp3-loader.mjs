// ESM loader to handle .mp3 file imports in Node.js
// Returns empty string for all .mp3 files

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.endsWith('.mp3')) {
    // Return a synthetic module
    return {
      url: new URL(specifier, context.parentURL).href,
      shortCircuit: true
    };
  }
  return defaultResolve(specifier, context);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.mp3')) {
    return {
      format: 'module',
      source: 'export default "";',
      shortCircuit: true
    };
  }
  return defaultLoad(url, context);
}
