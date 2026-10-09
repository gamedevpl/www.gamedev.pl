import { transform } from 'esbuild';

// See docs/security-model.md "Shipped game code" for why minify only.
export async function protectGameScript(js: string): Promise<string> {
  const minified = await transform(js, {
    loader: 'js',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    sourcemap: false,
  });
  return minified.code;
}
