import { MAX_SHOT_BYTES } from '@gamedevpl/contract';

const MAX_PNG_BASE64_CHARS = Math.ceil(MAX_SHOT_BYTES / 3) * 4;
const MAX_IMAGE_DIMENSION = 1600;
const RESIZE_FACTOR = 0.75;

function base64Payload(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? null : dataUrl.slice(comma + 1);
}

function renderPng(image: HTMLImageElement, width: number, height: number): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    return base64Payload(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

async function resizePngToLimit(dataUrl: string): Promise<string | null> {
  const image = await loadImage(dataUrl);
  if (!image) return null;

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  let width = Math.max(1, Math.round(sourceWidth * scale));
  let height = Math.max(1, Math.round(sourceHeight * scale));

  while (true) {
    const png = renderPng(image, width, height);
    if (!png) return null;
    if (png.length <= MAX_PNG_BASE64_CHARS) return png;

    const nextWidth = Math.max(1, Math.floor(width * RESIZE_FACTOR));
    const nextHeight = Math.max(1, Math.floor(height * RESIZE_FACTOR));
    if (nextWidth === width && nextHeight === height) return null;
    width = nextWidth;
    height = nextHeight;
  }
}

export async function toBase64Png(dataUrl: string): Promise<string | null> {
  const payload = base64Payload(dataUrl);
  if (!payload) return null;
  if (dataUrl.startsWith('data:image/png') && payload.length <= MAX_PNG_BASE64_CHARS) return payload;
  return resizePngToLimit(dataUrl);
}

export async function toBase64PngList(dataUrls: string[]): Promise<string[]> {
  const results = await Promise.all(dataUrls.map((dataUrl) => toBase64Png(dataUrl)));
  return results.filter((png): png is string => png !== null);
}
