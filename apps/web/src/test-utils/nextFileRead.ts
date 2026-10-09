import { vi } from 'vitest';

export function nextFileRead(): Promise<void> {
  const read = FileReader.prototype.readAsDataURL;
  return new Promise((resolve) => {
    const spy = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(function (
      this: FileReader,
      blob: Blob,
    ) {
      this.addEventListener(
        'loadend',
        () => {
          spy.mockRestore();
          resolve();
        },
        { once: true },
      );
      read.call(this, blob);
    });
  });
}
