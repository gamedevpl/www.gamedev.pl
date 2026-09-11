import { spawn } from 'node:child_process';

export function openUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve(false);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return Promise.resolve(false);
  const [cmd, args] =
    process.platform === 'darwin'
      ? (['open', [url]] as const)
      : process.platform === 'win32'
        ? (['rundll32', ['url.dll,FileProtocolHandler', url]] as const)
        : (['xdg-open', [url]] as const);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}
