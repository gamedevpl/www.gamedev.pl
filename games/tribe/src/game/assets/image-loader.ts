import { IMAGE_FILE_MAP, ImageType, ImageAsset } from './image-types';

// Re-export types for easier importing
export type { ImageAsset } from './image-types';
export { ImageType } from './image-types';

export const imageAssets = new Map<ImageType, ImageAsset>();

let isLoading = false;
let hasLoaded = false;

export async function initImageLoader(): Promise<void> {
  if (hasLoaded || isLoading) {
    return;
  }

  if (typeof window === 'undefined') {
    console.warn('Window object not available. Cannot load images.');
    return;
  }

  isLoading = true;
  console.log('Starting image asset loading...');

  const imagePromises: Promise<void>[] = [];

  IMAGE_FILE_MAP.forEach((imagePath, imageType) => {
    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        imageAssets.set(imageType, {
          image: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        resolve();
      };
      
      img.onerror = () => {
        console.error(`Failed to load image ${ImageType[imageType]} from ${imagePath}`);
        reject(new Error(`Failed to load image: ${imagePath}`));
      };
      
      img.src = imagePath;
    });
    
    imagePromises.push(promise);
  });

  try {
    await Promise.all(imagePromises);
    hasLoaded = true;
    isLoading = false;
    console.log('All image assets loaded successfully.');
  } catch (error) {
    isLoading = false;
    console.error('An error occurred while loading images:', error);
  }
}

export function getImageAsset(imageType: ImageType): ImageAsset | undefined {
  return imageAssets.get(imageType);
}