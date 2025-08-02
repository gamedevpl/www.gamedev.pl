// Sprout Lands Asset Pack Integration
// Asset pack by Cup Nooble: https://cupnooble.itch.io/sprout-lands-asset-pack

// For now, we'll use a data URL for a simple berry bush sprite
// In a real implementation, this would import actual image files from the asset pack
const berryBushDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Berry bush with green foliage and red berries -->
  <ellipse cx="16" cy="20" rx="12" ry="8" fill="#228B22"/>
  <ellipse cx="16" cy="18" rx="10" ry="6" fill="#32CD32"/>
  <!-- Red berries -->
  <circle cx="12" cy="16" r="2" fill="#FF0000"/>
  <circle cx="20" cy="18" r="2" fill="#FF0000"/>
  <circle cx="16" cy="22" r="2" fill="#FF0000"/>
  <circle cx="10" cy="20" r="1.5" fill="#DC143C"/>
  <circle cx="22" cy="16" r="1.5" fill="#DC143C"/>
</svg>
`)}`;

export enum ImageType {
  // Sprout Lands Objects
  BerryBush,
}

export const IMAGE_FILE_MAP = new Map<ImageType, string>([
  [ImageType.BerryBush, berryBushDataUrl],
]);

export interface ImageAsset {
  image: HTMLImageElement;
  width: number;
  height: number;
}