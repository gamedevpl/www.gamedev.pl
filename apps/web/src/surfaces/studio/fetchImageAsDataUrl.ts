// Pulls a same-origin image into a data URL for the composer.
export async function fetchImageAsDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'include', ...(signal ? { signal } : {}) });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
