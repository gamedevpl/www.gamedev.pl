import { openUrl } from './open-url.js';
import type { SessionController } from './session-controller.js';
import { startSessionBrowser } from './session-browser-server.js';

export function sessionBrowserHost(session: SessionController) {
  let preview = '';
  let opening: ReturnType<typeof startSessionBrowser> | undefined;
  let closed = false;
  const unsubscribe = session.subscribe((state) => {
    if (preview && !state.previewUrl) {
      preview = '';
      void opening?.then((server) => server.clearPreview()).catch(() => undefined);
    }
  });
  return {
    registerPreview(url: string) {
      preview = url;
      void opening
        ?.then((server) => {
          if (!closed && preview === url) server.setPreview(url);
        })
        .catch(() => undefined);
    },
    async open(url: string): Promise<boolean> {
      if (closed) return false;
      if (!preview || preview !== url) return openUrl(url);
      opening ??= startSessionBrowser(session).catch((error: unknown) => {
        opening = undefined;
        throw error;
      });
      try {
        const server = await opening;
        if (closed) return false;
        if (preview) server.setPreview(preview);
        const opened = await openUrl(server.url);
        if (!opened) session.writeLine(`Open the editing panel: ${server.url}`);
        return opened;
      } catch {
        session.writeLine('Could not start the editing panel. The terminal session is still available.');
        return false;
      }
    },
    async close() {
      closed = true;
      unsubscribe();
      await opening?.then((server) => server.close()).catch(() => undefined);
    },
  };
}
