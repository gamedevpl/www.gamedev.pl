import { knownLibFilesForCompilerOptions } from '@typescript/vfs';
import ts from 'typescript';
import { COMPILER_OPTIONS } from './tsCompilerOptions.js';

const libLoaders = import.meta.glob('../../../../../node_modules/typescript/lib/lib*.d.ts', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

export async function loadLibFiles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    knownLibFilesForCompilerOptions(COMPILER_OPTIONS, ts).map(async (fileName) => {
      const entry = Object.entries(libLoaders).find(([path]) => path.endsWith(`/${fileName}`));
      if (entry) map.set(`/${fileName}`, await entry[1]());
    }),
  );
  return map;
}
