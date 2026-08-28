import { describe, expect, it } from 'vitest';
import { filesFromDataTransfer } from './codeSurfaceDrop.js';

describe('codeSurfaceDrop', () => {
  it('does not walk reserved directories such as node_modules', async () => {
    const ignored = new File(['secret'], 'index.js');
    const keep = new File(['export {};\n'], 'player.ts');
    const transfer = {
      items: [
        {
          kind: 'file',
          webkitGetAsEntry: () => ({
            isFile: false,
            isDirectory: true,
            name: 'node_modules',
            createReader: () => {
              throw new Error('should not read node_modules');
            },
          }),
        },
        {
          kind: 'file',
          webkitGetAsEntry: () => ({
            isFile: true,
            isDirectory: false,
            name: 'player.ts',
            file: (ok: (file: File) => void) => ok(keep),
          }),
        },
      ],
      files: [ignored, keep],
    };
    const files = await filesFromDataTransfer(transfer as unknown as DataTransfer);
    expect(files.map((file) => file.name)).toEqual(['player.ts']);
  });
});
