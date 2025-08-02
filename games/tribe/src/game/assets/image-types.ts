// Sprout Lands Asset Pack Integration
// Asset pack by Cup Nooble: https://cupnooble.itch.io/sprout-lands-asset-pack

// For now, we'll use data URLs for sprites inspired by the Sprout Lands style
// In a real implementation, these would import actual image files from the asset pack

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

// Terrain tiles inspired by Sprout Lands grass tiles
const grassTileDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Base grass -->
  <rect width="32" height="32" fill="#4a7c59"/>
  <!-- Grass texture -->
  <rect x="0" y="0" width="8" height="8" fill="#5a8c69"/>
  <rect x="16" y="8" width="8" height="8" fill="#5a8c69"/>
  <rect x="8" y="16" width="8" height="8" fill="#5a8c69"/>
  <rect x="24" y="24" width="8" height="8" fill="#5a8c69"/>
  <!-- Grass details -->
  <circle cx="6" cy="10" r="1" fill="#6a9c79"/>
  <circle cx="22" cy="14" r="1" fill="#6a9c79"/>
  <circle cx="14" cy="26" r="1" fill="#6a9c79"/>
  <circle cx="30" cy="6" r="1" fill="#6a9c79"/>
</svg>
`)}`;

const dirtTileDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Base dirt -->
  <rect width="32" height="32" fill="#8b4513"/>
  <!-- Dirt texture -->
  <rect x="4" y="4" width="4" height="4" fill="#a0522d"/>
  <rect x="12" y="8" width="4" height="4" fill="#a0522d"/>
  <rect x="20" y="12" width="4" height="4" fill="#a0522d"/>
  <rect x="8" y="20" width="4" height="4" fill="#a0522d"/>
  <rect x="24" y="24" width="4" height="4" fill="#a0522d"/>
  <!-- Small stones -->
  <circle cx="10" cy="6" r="1" fill="#696969"/>
  <circle cx="26" cy="18" r="1" fill="#696969"/>
  <circle cx="16" cy="28" r="1" fill="#696969"/>
</svg>
`)}`;

// Environmental objects
const treeDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="48" height="64" xmlns="http://www.w3.org/2000/svg">
  <!-- Tree trunk -->
  <rect x="20" y="40" width="8" height="24" fill="#8B4513"/>
  <!-- Tree foliage -->
  <ellipse cx="24" cy="35" rx="20" ry="15" fill="#228B22"/>
  <ellipse cx="24" cy="30" rx="16" ry="12" fill="#32CD32"/>
  <!-- Tree highlights -->
  <ellipse cx="20" cy="28" rx="6" ry="4" fill="#90EE90"/>
  <ellipse cx="28" cy="32" rx="5" ry="3" fill="#90EE90"/>
</svg>
`)}`;

const rockDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="24" xmlns="http://www.w3.org/2000/svg">
  <!-- Rock base -->
  <ellipse cx="16" cy="20" rx="14" ry="4" fill="#555555"/>
  <!-- Rock body -->
  <ellipse cx="16" cy="14" rx="12" ry="8" fill="#808080"/>
  <ellipse cx="16" cy="12" rx="10" ry="6" fill="#A0A0A0"/>
  <!-- Rock highlights -->
  <ellipse cx="12" cy="10" rx="3" ry="2" fill="#C0C0C0"/>
  <ellipse cx="20" cy="8" rx="2" ry="1" fill="#C0C0C0"/>
</svg>
`)}`;

const flowerDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
  <!-- Flower stem -->
  <rect x="7" y="10" width="2" height="6" fill="#228B22"/>
  <!-- Flower petals -->
  <circle cx="8" cy="8" r="3" fill="#FFB6C1"/>
  <circle cx="5" cy="8" r="2" fill="#FFC0CB"/>
  <circle cx="11" cy="8" r="2" fill="#FFC0CB"/>
  <circle cx="8" cy="5" r="2" fill="#FFC0CB"/>
  <circle cx="8" cy="11" r="2" fill="#FFC0CB"/>
  <!-- Flower center -->
  <circle cx="8" cy="8" r="1" fill="#FFD700"/>
</svg>
`)}`;

export enum ImageType {
  // Sprout Lands Objects
  BerryBush,
  
  // Terrain Tiles
  GrassTile,
  DirtTile,
  
  // Environmental Objects
  Tree,
  Rock,
  Flower,
}

export const IMAGE_FILE_MAP = new Map<ImageType, string>([
  [ImageType.BerryBush, berryBushDataUrl],
  [ImageType.GrassTile, grassTileDataUrl],
  [ImageType.DirtTile, dirtTileDataUrl],
  [ImageType.Tree, treeDataUrl],
  [ImageType.Rock, rockDataUrl],
  [ImageType.Flower, flowerDataUrl],
]);

export interface ImageAsset {
  image: HTMLImageElement;
  width: number;
  height: number;
}