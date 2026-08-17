// Converts an arbitrary image data URL (upload of any type, or a sketch canvas export)
// to a base64 PNG with no `data:` prefix — the shape the backend's build-shot storage
// validates against (PNG signature check). Uploads are re-encoded through a canvas so a
// JPEG/WebP photo still lands as a PNG the backend will accept.
export async function toBase64Png(dataUrl: string): Promise<string | null> {
  if (dataUrl.startsWith('data:image/png')) {
    const comma = dataUrl.indexOf(',');
    return comma === -1 ? null : dataUrl.slice(comma + 1);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const png = canvas.toDataURL('image/png');
      const comma = png.indexOf(',');
      resolve(comma === -1 ? null : png.slice(comma + 1));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Converts a list of data URLs to base64 PNGs, dropping any that fail to decode. */
export async function toBase64PngList(dataUrls: string[]): Promise<string[]> {
  const results = await Promise.all(dataUrls.map((dataUrl) => toBase64Png(dataUrl)));
  return results.filter((png): png is string => png !== null);
}
