import { RASTER_ASSET_MAX_FILE_BYTES } from '../platform/games-repo-contract.js';

/** Same shape games-repo `tools/lib/raster-assets.ts` accepts. */
const HANDLE = /^[a-z][a-z0-9-]*$/;
const REL_PATH = /^(?:scenes|cast|images)\/[a-z0-9][a-z0-9/_-]*\.(?:png|webp)$/i;

export type ImageManifest = Record<string, string>;

export function parseGameImages(images: unknown): ImageManifest {
  if (images == null) return {};
  if (typeof images !== 'object' || Array.isArray(images)) {
    throw new Error('game manifest images must be an object of name → path');
  }
  const out: ImageManifest = {};
  for (const [name, relPath] of Object.entries(images as Record<string, unknown>)) {
    if (!HANDLE.test(name)) {
      throw new Error(`game image name "${name}" must be kebab-case`);
    }
    if (typeof relPath !== 'string' || !relPath) {
      throw new Error(`game declares image "${name}" with a non-string path`);
    }
    if (!REL_PATH.test(relPath) || relPath.includes('..') || relPath.includes('//')) {
      throw new Error(`game image "${name}" path must be under scenes/, cast/, or images/ as a .png or .webp`);
    }
    out[name] = relPath;
  }
  return out;
}

export function mimeForImagePath(relPath: string): string {
  return relPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Reject corrupt bytes and extension-mismatched formats before they become data URIs. */
export function assertImageSignature(name: string, relPath: string, bytes: Uint8Array): void {
  const prefix = `game image "${name}"`;
  if (relPath.toLowerCase().endsWith('.webp')) {
    if (!isWebp(bytes)) {
      throw new Error(`${prefix} is not a WebP (missing RIFF/WEBP signature)`);
    }
    return;
  }
  if (isJpeg(bytes)) {
    throw new Error(`${prefix} is a JPEG, not a PNG`);
  }
  if (!isPng(bytes)) {
    throw new Error(`${prefix} is not a PNG (missing signature)`);
  }
}

export function assertImageFileSize(name: string, bytes: number): void {
  if (bytes > RASTER_ASSET_MAX_FILE_BYTES) {
    throw new Error(
      `game image "${name}" is ${bytes} bytes; quantized PNG/WebP must stay under ${RASTER_ASSET_MAX_FILE_BYTES}`,
    );
  }
}

/** Loader chrome shown while the document parses and embedded bitmaps decode. */
export function imageLoaderHtml(): string {
  return `    <style>
      .gk-load{position:fixed;inset:0;z-index:1100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;margin:0;background:#070b14;color:#eff8ff;font:600 16px system-ui,sans-serif}
      .gk-load[hidden]{display:none}
      .gk-load-track{width:min(240px,70vw);height:8px;border-radius:99px;background:#1c2740;overflow:hidden}
      .gk-load-fill{width:0;height:100%;background:#7aa2ff;transition:width .2s linear}
      @media (prefers-reduced-motion:reduce){.gk-load-fill{transition:none}}
    </style>
    <div id="gk-load" class="gk-load" role="status" aria-live="polite">
      <div class="gk-load-track"><div id="gk-load-fill" class="gk-load-fill"></div></div>
      <p data-i18n-en="Loading…" data-i18n-pl="Wczytywanie…">Loading…</p>
    </div>
`;
}

export function imageLoaderBootJs(names: string[]): string {
  return `(function(){
  var names = ${JSON.stringify(names)};
  var assets = window.__GAME_IMAGE_ASSETS__ || {};
  var els = window.__GAME_IMAGE_ELEMENTS__ = Object.create(null);
  var progress = window.__GAME_IMAGE_PROGRESS__ = { done: 0, total: names.length };
  function hide() {
    var node = document.getElementById('gk-load');
    if (node) node.hidden = true;
  }
  function tick() {
    var fill = document.getElementById('gk-load-fill');
    if (fill && progress.total) fill.style.width = (100 * progress.done / progress.total) + '%';
    if (progress.done >= progress.total) hide();
  }
  try {
    if (/[?&]capture=1(?:&|$)/.test(String(location.search || ''))) hide();
  } catch (e) {}
  if (!names.length) { hide(); return; }
  for (var i = 0; i < names.length; i++) {
    (function(name) {
      var img = new Image();
      img.setAttribute('data-gk-image', name);
      img.__gkHandle = name;
      img.onload = img.onerror = function() { progress.done++; tick(); };
      els[name] = img;
      img.src = assets[name];
    })(names[i]);
  }
  tick();
})();`;
}
