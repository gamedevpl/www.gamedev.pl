import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';

// See docs/security-model.md "Shipped game code". Never obfuscatePro: it uploads.
export async function protectGameScript(js: string): Promise<string> {
  const minified = await transform(js, {
    loader: 'js',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    sourcemap: false,
  });

  const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
    target: 'browser',
    // Deterministic: an unchanged game re-bakes byte-identical.
    seed: seedFor(js),
    compact: true,
    simplify: true,
    sourceMap: false,
    renameGlobals: false,
    identifierNamesGenerator: 'mangled',
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    splitStrings: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersType: 'variable',
    stringArrayCallsTransform: false,
    // Baked media data: URIs gain nothing from the string array.
    reservedStrings: ['^data:'],
  });

  return obfuscated.getObfuscatedCode();
}

function seedFor(js: string): number {
  return createHash('sha256').update(js).digest().readUInt32BE(0);
}
