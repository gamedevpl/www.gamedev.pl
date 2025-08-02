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

// Character sprites inspired by Sprout Lands characters
// Male character - adult, idle stance
const maleCharacterIdleDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs -->
  <rect x="12" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="17" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Pants -->
  <rect x="11" y="20" width="5" height="5" fill="#8B4513"/>
  <rect x="16" y="20" width="5" height="5" fill="#8B4513"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="8" fill="#D4A574"/>
  <!-- Arms -->
  <rect x="8" y="14" width="3" height="6" fill="#D4A574"/>
  <rect x="21" y="14" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Hair -->
  <rect x="12" y="6" width="8" height="3" fill="#8B4513"/>
  <!-- Beard -->
  <rect x="13" y="10" width="6" height="2" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Female character - adult, idle stance
const femaleCharacterIdleDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs -->
  <rect x="12" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="17" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Dress -->
  <rect x="10" y="16" width="12" height="8" fill="#8B6B47"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="6" fill="#8B6B47"/>
  <!-- Arms -->
  <rect x="8" y="14" width="3" height="6" fill="#D4A574"/>
  <rect x="21" y="14" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Long hair -->
  <rect x="11" y="6" width="10" height="4" fill="#8B4513"/>
  <rect x="10" y="8" width="2" height="4" fill="#8B4513"/>
  <rect x="20" y="8" width="2" height="4" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Male character walking
const maleCharacterWalkDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (walking position) -->
  <rect x="11" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="18" y="21" width="3" height="7" fill="#D4A574"/>
  <!-- Pants -->
  <rect x="10" y="20" width="5" height="5" fill="#8B4513"/>
  <rect x="17" y="19" width="5" height="6" fill="#8B4513"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="8" fill="#D4A574"/>
  <!-- Arms (walking position) -->
  <rect x="7" y="13" width="3" height="6" fill="#D4A574"/>
  <rect x="22" y="15" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Hair -->
  <rect x="12" y="6" width="8" height="3" fill="#8B4513"/>
  <!-- Beard -->
  <rect x="13" y="10" width="6" height="2" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Female character walking
const femaleCharacterWalkDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (walking position) -->
  <rect x="11" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="18" y="21" width="3" height="7" fill="#D4A574"/>
  <!-- Dress -->
  <rect x="9" y="16" width="14" height="8" fill="#8B6B47"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="6" fill="#8B6B47"/>
  <!-- Arms (walking position) -->
  <rect x="7" y="13" width="3" height="6" fill="#D4A574"/>
  <rect x="22" y="15" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Long hair -->
  <rect x="11" y="6" width="10" height="4" fill="#8B4513"/>
  <rect x="10" y="8" width="2" height="4" fill="#8B4513"/>
  <rect x="20" y="8" width="2" height="4" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Male character gathering
const maleCharacterGatheringDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (bent) -->
  <rect x="12" y="24" width="3" height="4" fill="#D4A574"/>
  <rect x="17" y="24" width="3" height="4" fill="#D4A574"/>
  <!-- Pants -->
  <rect x="11" y="22" width="5" height="4" fill="#8B4513"/>
  <rect x="16" y="22" width="5" height="4" fill="#8B4513"/>
  <!-- Torso (leaning forward) -->
  <rect x="11" y="14" width="10" height="8" fill="#D4A574"/>
  <!-- Arms (reaching out) -->
  <rect x="6" y="12" width="3" height="6" fill="#D4A574"/>
  <rect x="23" y="12" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="8" width="8" height="6" fill="#D4A574"/>
  <!-- Hair -->
  <rect x="12" y="8" width="8" height="3" fill="#8B4513"/>
  <!-- Beard -->
  <rect x="13" y="12" width="6" height="2" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="10" width="1" height="1" fill="#000"/>
  <rect x="17" y="10" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Female character gathering
const femaleCharacterGatheringDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (bent) -->
  <rect x="12" y="24" width="3" height="4" fill="#D4A574"/>
  <rect x="17" y="24" width="3" height="4" fill="#D4A574"/>
  <!-- Dress -->
  <rect x="10" y="18" width="12" height="8" fill="#8B6B47"/>
  <!-- Torso (leaning forward) -->
  <rect x="11" y="14" width="10" height="6" fill="#8B6B47"/>
  <!-- Arms (reaching out) -->
  <rect x="6" y="12" width="3" height="6" fill="#D4A574"/>
  <rect x="23" y="12" width="3" height="6" fill="#D4A574"/>
  <!-- Head -->
  <rect x="12" y="8" width="8" height="6" fill="#D4A574"/>
  <!-- Long hair -->
  <rect x="11" y="8" width="10" height="4" fill="#8B4513"/>
  <rect x="10" y="10" width="2" height="4" fill="#8B4513"/>
  <rect x="20" y="10" width="2" height="4" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="10" width="1" height="1" fill="#000"/>
  <rect x="17" y="10" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Male character eating
const maleCharacterEatingDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs -->
  <rect x="12" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="17" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Pants -->
  <rect x="11" y="20" width="5" height="5" fill="#8B4513"/>
  <rect x="16" y="20" width="5" height="5" fill="#8B4513"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="8" fill="#D4A574"/>
  <!-- Arms (one to mouth) -->
  <rect x="8" y="14" width="3" height="6" fill="#D4A574"/>
  <rect x="16" y="8" width="3" height="6" fill="#D4A574"/>
  <!-- Food in hand -->
  <rect x="17" y="7" width="2" height="2" fill="#FF6B6B"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Hair -->
  <rect x="12" y="6" width="8" height="3" fill="#8B4513"/>
  <!-- Beard -->
  <rect x="13" y="10" width="6" height="2" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Female character eating
const femaleCharacterEatingDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs -->
  <rect x="12" y="22" width="3" height="6" fill="#D4A574"/>
  <rect x="17" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Dress -->
  <rect x="10" y="16" width="12" height="8" fill="#8B6B47"/>
  <!-- Torso -->
  <rect x="11" y="12" width="10" height="6" fill="#8B6B47"/>
  <!-- Arms (one to mouth) -->
  <rect x="8" y="14" width="3" height="6" fill="#D4A574"/>
  <rect x="16" y="8" width="3" height="6" fill="#D4A574"/>
  <!-- Food in hand -->
  <rect x="17" y="7" width="2" height="2" fill="#FF6B6B"/>
  <!-- Head -->
  <rect x="12" y="6" width="8" height="6" fill="#D4A574"/>
  <!-- Long hair -->
  <rect x="11" y="6" width="10" height="4" fill="#8B4513"/>
  <rect x="10" y="8" width="2" height="4" fill="#8B4513"/>
  <rect x="20" y="8" width="2" height="4" fill="#8B4513"/>
  <!-- Eyes -->
  <rect x="14" y="8" width="1" height="1" fill="#000"/>
  <rect x="17" y="8" width="1" height="1" fill="#000"/>
</svg>
`)}`;

// Male character attacking
const maleCharacterAttackingDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (lunging) -->
  <rect x="10" y="23" width="3" height="5" fill="#D4A574"/>
  <rect x="19" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Pants -->
  <rect x="9" y="21" width="5" height="5" fill="#8B4513"/>
  <rect x="18" y="20" width="5" height="5" fill="#8B4513"/>
  <!-- Torso (leaning forward) -->
  <rect x="11" y="13" width="10" height="8" fill="#D4A574"/>
  <!-- Arms (raised for attack) -->
  <rect x="8" y="10" width="3" height="6" fill="#D4A574"/>
  <rect x="21" y="9" width="3" height="6" fill="#D4A574"/>
  <!-- Weapon/fist -->
  <rect x="22" y="8" width="2" height="2" fill="#8B4513"/>
  <!-- Head -->
  <rect x="12" y="7" width="8" height="6" fill="#D4A574"/>
  <!-- Hair -->
  <rect x="12" y="7" width="8" height="3" fill="#8B4513"/>
  <!-- Beard -->
  <rect x="13" y="11" width="6" height="2" fill="#8B4513"/>
  <!-- Eyes (angry) -->
  <rect x="14" y="9" width="1" height="1" fill="#FF0000"/>
  <rect x="17" y="9" width="1" height="1" fill="#FF0000"/>
</svg>
`)}`;

// Female character attacking
const femaleCharacterAttackingDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
  <!-- Legs (lunging) -->
  <rect x="10" y="23" width="3" height="5" fill="#D4A574"/>
  <rect x="19" y="22" width="3" height="6" fill="#D4A574"/>
  <!-- Dress -->
  <rect x="9" y="17" width="12" height="8" fill="#8B6B47"/>
  <!-- Torso (leaning forward) -->
  <rect x="11" y="13" width="10" height="6" fill="#8B6B47"/>
  <!-- Arms (raised for attack) -->
  <rect x="8" y="10" width="3" height="6" fill="#D4A574"/>
  <rect x="21" y="9" width="3" height="6" fill="#D4A574"/>
  <!-- Weapon/fist -->
  <rect x="22" y="8" width="2" height="2" fill="#8B4513"/>
  <!-- Head -->
  <rect x="12" y="7" width="8" height="6" fill="#D4A574"/>
  <!-- Long hair -->
  <rect x="11" y="7" width="10" height="4" fill="#8B4513"/>
  <rect x="10" y="9" width="2" height="4" fill="#8B4513"/>
  <rect x="20" y="9" width="2" height="4" fill="#8B4513"/>
  <!-- Eyes (angry) -->
  <rect x="14" y="9" width="1" height="1" fill="#FF0000"/>
  <rect x="17" y="9" width="1" height="1" fill="#FF0000"/>
</svg>
`)}`;

// Dead character (skeleton)
const characterDeadDataUrl = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <!-- Shadow -->
  <ellipse cx="16" cy="29" rx="10" ry="3" fill="rgba(0,0,0,0.2)"/>
  <!-- Skeleton lying down -->
  <!-- Leg bones -->
  <rect x="8" y="20" width="6" height="2" fill="#E0E0E0"/>
  <rect x="18" y="20" width="6" height="2" fill="#E0E0E0"/>
  <!-- Hip bone -->
  <rect x="12" y="18" width="8" height="3" fill="#E0E0E0"/>
  <!-- Rib cage -->
  <rect x="10" y="14" width="12" height="5" fill="#E0E0E0"/>
  <!-- Ribs -->
  <rect x="11" y="15" width="10" height="1" fill="#D0D0D0"/>
  <rect x="11" y="17" width="10" height="1" fill="#D0D0D0"/>
  <!-- Arm bones -->
  <rect x="6" y="16" width="5" height="2" fill="#E0E0E0"/>
  <rect x="21" y="16" width="5" height="2" fill="#E0E0E0"/>
  <!-- Skull -->
  <rect x="13" y="10" width="6" height="5" fill="#F0F0F0"/>
  <!-- Eye sockets -->
  <rect x="14" y="12" width="1" height="1" fill="#000"/>
  <rect x="17" y="12" width="1" height="1" fill="#000"/>
  <!-- Jaw -->
  <rect x="14" y="14" width="4" height="1" fill="#E0E0E0"/>
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
  
  // Character Sprites
  MaleCharacterIdle,
  FemaleCharacterIdle,
  MaleCharacterWalk,
  FemaleCharacterWalk,
  MaleCharacterGathering,
  FemaleCharacterGathering,
  MaleCharacterEating,
  FemaleCharacterEating,
  MaleCharacterAttacking,
  FemaleCharacterAttacking,
  CharacterDead,
}

export const IMAGE_FILE_MAP = new Map<ImageType, string>([
  [ImageType.BerryBush, berryBushDataUrl],
  [ImageType.GrassTile, grassTileDataUrl],
  [ImageType.DirtTile, dirtTileDataUrl],
  [ImageType.Tree, treeDataUrl],
  [ImageType.Rock, rockDataUrl],
  [ImageType.Flower, flowerDataUrl],
  [ImageType.MaleCharacterIdle, maleCharacterIdleDataUrl],
  [ImageType.FemaleCharacterIdle, femaleCharacterIdleDataUrl],
  [ImageType.MaleCharacterWalk, maleCharacterWalkDataUrl],
  [ImageType.FemaleCharacterWalk, femaleCharacterWalkDataUrl],
  [ImageType.MaleCharacterGathering, maleCharacterGatheringDataUrl],
  [ImageType.FemaleCharacterGathering, femaleCharacterGatheringDataUrl],
  [ImageType.MaleCharacterEating, maleCharacterEatingDataUrl],
  [ImageType.FemaleCharacterEating, femaleCharacterEatingDataUrl],
  [ImageType.MaleCharacterAttacking, maleCharacterAttackingDataUrl],
  [ImageType.FemaleCharacterAttacking, femaleCharacterAttackingDataUrl],
  [ImageType.CharacterDead, characterDeadDataUrl],
]);

export interface ImageAsset {
  image: HTMLImageElement;
  width: number;
  height: number;
}