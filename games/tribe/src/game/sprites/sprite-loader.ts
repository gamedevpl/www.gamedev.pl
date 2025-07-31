/**
 * Sprite Loading System for Emoji Sprites
 * 
 * This module handles loading and caching of emoji sprites, providing a
 * replacement for Unicode emoji rendering throughout the game.
 */

// Mapping from Unicode emojis to sprite filenames
export const EMOJI_TO_SPRITE_MAP: Record<string, string> = {
  // Tribe Badges
  '👑': 'crown',
  '💀': 'skull',
  '🔥': 'fire',
  '💧': 'water_drop',
  '☘️': 'shamrock',
  '☀️': 'sun',
  '🌙': 'crescent_moon',
  '⭐': 'star',
  '⚡': 'lightning',
  '⚜️': 'fleur_de_lis',
  
  // Diplomacy Status
  '🤝': 'handshake',
  '⚔️': 'crossed_swords',
  
  // Player Actions
  '✋': 'raised_hand',
  '🍖': 'meat',
  '❤️': 'heart',
  '🌱': 'seedling',
  '📢': 'megaphone',
  '🔱': 'trident',
  '➡️': 'right_arrow',
  '👨‍👧': 'man_feeding_child',
  '🎯': 'bullseye',
  
  // Status Indicators
  '🗓️': 'calendar',
  '🍓': 'strawberry',
  '🤖': 'robot',
  '👨‍👩‍👧‍👦': 'family',
  
  // Visual Effects
  '🍼': 'baby_bottle',
  '🛡️': 'shield',
  '💪': 'muscle',
  '💥': 'explosion',
};

// Cache for loaded sprite images
const spriteCache = new Map<string, HTMLImageElement>();

// Cache for loading promises to avoid duplicate loads
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load a single sprite image
 */
function loadSprite(spriteName: string): Promise<HTMLImageElement> {
  // Return existing promise if already loading/loaded
  if (loadingPromises.has(spriteName)) {
    return loadingPromises.get(spriteName)!;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      spriteCache.set(spriteName, img);
      resolve(img);
    };
    
    img.onerror = () => {
      console.warn(`Failed to load sprite: ${spriteName}`);
      reject(new Error(`Failed to load sprite: ${spriteName}`));
    };
    
    // Set sprite path - assumes sprites are in public/assets/sprites/emojis/
    img.src = `assets/sprites/emojis/${spriteName}.png`;
  });
  
  loadingPromises.set(spriteName, promise);
  return promise;
}

/**
 * Preload all emoji sprites
 */
export async function preloadSprites(): Promise<void> {
  const spriteNames = Object.values(EMOJI_TO_SPRITE_MAP);
  const uniqueSpriteNames = [...new Set(spriteNames)]; // Remove duplicates
  
  try {
    await Promise.all(uniqueSpriteNames.map(loadSprite));
    console.log(`Successfully preloaded ${uniqueSpriteNames.length} emoji sprites`);
  } catch (error) {
    console.error('Failed to preload some sprites:', error);
    // Don't throw - game should continue with fallback rendering
  }
}

/**
 * Get a sprite by emoji Unicode character
 */
export function getSpriteByEmoji(emoji: string): HTMLImageElement | null {
  const spriteName = EMOJI_TO_SPRITE_MAP[emoji];
  if (!spriteName) {
    console.warn(`No sprite mapping found for emoji: ${emoji}`);
    return null;
  }
  
  return spriteCache.get(spriteName) || null;
}

/**
 * Get a sprite by sprite name
 */
export function getSpriteByName(spriteName: string): HTMLImageElement | null {
  return spriteCache.get(spriteName) || null;
}

/**
 * Check if a sprite is loaded
 */
export function isSpriteLoaded(emoji: string): boolean {
  const spriteName = EMOJI_TO_SPRITE_MAP[emoji];
  return spriteName ? spriteCache.has(spriteName) : false;
}

/**
 * Draw a sprite at the specified position with optional scaling
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  size: number = 32
): boolean {
  const sprite = getSpriteByEmoji(emoji);
  
  if (!sprite) {
    // Fallback: draw emoji as text (original behavior)
    ctx.save();
    ctx.font = `${size * 0.75}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
    ctx.restore();
    return false;
  }
  
  // Draw sprite centered at position
  ctx.drawImage(
    sprite,
    x - size / 2,
    y - size / 2,
    size,
    size
  );
  
  return true;
}

/**
 * Draw a sprite with floating animation (for visual effects)
 */
export function drawSpriteWithEffect(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  opacity: number,
  yOffset: number = 0,
  size: number = 32
): boolean {
  ctx.save();
  ctx.globalAlpha = opacity;
  
  const success = drawSprite(ctx, emoji, x, y + yOffset, size);
  
  ctx.restore();
  return success;
}

/**
 * Get the list of all available sprite names
 */
export function getAvailableSpriteNames(): string[] {
  return [...new Set(Object.values(EMOJI_TO_SPRITE_MAP))];
}

/**
 * Clear sprite cache (useful for testing or memory management)
 */
export function clearSpriteCache(): void {
  spriteCache.clear();
  loadingPromises.clear();
}