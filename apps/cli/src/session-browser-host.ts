import { platformPreview } from './workbench-platform.js';
import type { ApiClient } from './api.js';
import { openUrl } from './open-url.js';
import type { SessionController } from './session-controller.js';
import { startSessionBrowser } from './session-browser-server.js';

export function sessionBrowserHost(session: SessionController, headless = false) {
  let preview = '';
  let opening: ReturnType<typeof startSessionBrowser> | undefined;
  let closed = false;
  const unsubscribe = session.subscribe((state) => {
    if (preview && !state.previewUrl) {
      preview = '';
      void opening?.then((server) => server.clearPreview()).catch(() => undefined);
    }
  });
  const start = () =>
    (opening ??= startSessionBrowser(session, { detached: headless }).catch((error: unknown) => {
      opening = undefined;
      throw error;
    }));
  return {
    async start() {
      return (await start()).url;
    },
    registerPlatform(api: ApiClient, token: string) {
      if (!headless || preview) return;
      void opening
        ?.then((server) => server.setSource(`platform:${token}`, platformPreview(api, token)))
        .catch(() => undefined);
    },
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
      opening ??= startSessionBrowser(session, { detached: headless }).catch((error: unknown) => {
        opening = undefined;
        throw error;
      });
      try {
        const server = await opening;
        if (closed) return false;
        if (preview) server.setPreview(preview);
        const opened = headless || (await openUrl(server.url));
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
