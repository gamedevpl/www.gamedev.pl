import { Asset } from '../../../generator-core/src/assets-types';

// Types for water configuration
interface WaterConfig {
  waveAmplitude: number;
  waveFrequency: number;
  reflectionIntensity: number;
  foamIntensity: number;
  baseColor: string;
  deepColor: string;
  foamColor: string;
  reflectionColor: string;
  pixelSize: number;
}

// Stance-specific water configurations
const waterConfigs: Record<string, WaterConfig> = {
  default: {
    waveAmplitude: 0.4,
    waveFrequency: 1.5,
    reflectionIntensity: 0.5,
    foamIntensity: 0.3,
    baseColor: '#4fa4ff',
    deepColor: '#2a7ac7',
    foamColor: '#ffffff',
    reflectionColor: '#a7d8ff',
    pixelSize: 4
  },
  calm: {
    waveAmplitude: 0.2,
    waveFrequency: 0.8,
    reflectionIntensity: 0.7,
    foamIntensity: 0.1,
    baseColor: '#5cb3ff',
    deepColor: '#3a8ad7',
    foamColor: '#ffffff',
    reflectionColor: '#c7e8ff',
    pixelSize: 4
  },
  windy: {
    waveAmplitude: 0.7,
    waveFrequency: 2.5,
    reflectionIntensity: 0.3,
    foamIntensity: 0.6,
    baseColor: '#3a94ef',
    deepColor: '#1a6ab7',
    foamColor: '#ffffff',
    reflectionColor: '#87c8ff',
    pixelSize: 4
  }
};
/**
 * Helper function to calculate wave height at a specific position
 */
const getWaveHeight = (
  x: number, 
  progress: number, 
  config: WaterConfig, 
  width: number
): number => {
  // Create multiple overlapping sine waves for more natural look
  const primaryWave = Math.sin((x / width) * Math.PI * 2 * config.waveFrequency + progress * Math.PI * 2) * config.waveAmplitude;
  const secondaryWave = Math.sin((x / width) * Math.PI * 4 * config.waveFrequency + progress * Math.PI * 2 * 0.7) * (config.waveAmplitude * 0.5);
  const tertiaryWave = Math.sin((x / width) * Math.PI * 8 * config.waveFrequency + progress * Math.PI * 2 * 1.3) * (config.waveAmplitude * 0.25);
  
  return primaryWave + secondaryWave + tertiaryWave;
};

/**
 * Draws a pixel at the specified coordinates with the given color
 */
const drawPixel = (
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  color: string, 
  size: number
): void => {
  ctx.fillStyle = color;
  ctx.fillRect(
    Math.floor(x / size) * size, 
    Math.floor(y / size) * size, 
    size, 
    size
  );
};

/**
 * Generates foam effect based on wave height and position
 */
const getFoamIntensity = (
  waveHeight: number, 
  normalizedY: number, 
  config: WaterConfig
): number => {
  // More foam at wave peaks and near the top of the water
  const heightFactor = Math.max(0, waveHeight * 2); // More foam at wave peaks
  const topFactor = Math.max(0, 1 - normalizedY * 2); // More foam near the top
  
  return Math.min(1, heightFactor + topFactor) * config.foamIntensity;
};

/**
 * Calculates reflection effect intensity
 */
const getReflectionIntensity = (
  y: number, 
  height: number, 
  waveHeight: number, 
  config: WaterConfig
): number => {
  // Reflections appear more on flat areas (lower wave height)
  const flatnessFactor = 1 - Math.abs(waveHeight) * 2;
  // More reflections in the middle of the water
  const depthFactor = 1 - Math.abs((y / height) - 0.5) * 2;
  
  return Math.max(0, flatnessFactor * depthFactor * config.reflectionIntensity);
};

/**
 * Creates a water depth effect based on y-position
 */
const getDepthColor = (
  y: number, 
  height: number, 
  baseColor: string, 
  deepColor: string
): string => {
  const depth = y / height; // 0 at top, 1 at bottom
  
  // Simple linear interpolation between base and deep colors
  const r1 = parseInt(baseColor.slice(1, 3), 16);
  const g1 = parseInt(baseColor.slice(3, 5), 16);
  const b1 = parseInt(baseColor.slice(5, 7), 16);
  
  const r2 = parseInt(deepColor.slice(1, 3), 16);
  const g2 = parseInt(deepColor.slice(3, 5), 16);
  const b2 = parseInt(deepColor.slice(5, 7), 16);
  
  const r = Math.floor(r1 + (r2 - r1) * depth);
  const g = Math.floor(g1 + (g2 - g1) * depth);
  const b = Math.floor(b1 + (b2 - b1) * depth);
  
  return `rgb(${r}, ${g}, ${b})`;
};
/**
 * Renders a horizontal line of water with wave effects
 */
const renderWaterLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  lineY: number,
  height: number,
  progress: number,
  config: WaterConfig
): void => {
  // Draw pixel by pixel across the water line
  for (let pixelX = 0; pixelX < width; pixelX += config.pixelSize) {
    // Calculate wave height at this x position
    const waveHeight = getWaveHeight(pixelX, progress, config, width);
    
    // Apply wave offset to y position
    const offsetY = waveHeight * config.pixelSize * 3;
    const pixelY = lineY + offsetY;
    
    // Normalize y position for effect calculations (0 to 1)
    const normalizedY = (pixelY - y) / height;
    
    // Skip if outside the water area
    if (pixelY < y || pixelY >= y + height) continue;
    
    // Calculate foam effect
    const foamIntensity = getFoamIntensity(waveHeight, normalizedY, config);
    
    // Calculate reflection effect
    const reflectionIntensity = getReflectionIntensity(pixelY, height, waveHeight, config);
    
    // Get base water color based on depth
    const baseWaterColor = getDepthColor(
      pixelY - y, 
      height, 
      config.baseColor, 
      config.deepColor
    );
    
    // Determine final pixel color
    let finalColor = baseWaterColor;
    
    // Add reflection effect
    if (reflectionIntensity > 0.05) {
      // Simple color blending
      const r1 = parseInt(baseWaterColor.slice(4, baseWaterColor.indexOf(',')), 10);
      const g1 = parseInt(baseWaterColor.slice(baseWaterColor.indexOf(',') + 1, baseWaterColor.lastIndexOf(',')), 10);
      const b1 = parseInt(baseWaterColor.slice(baseWaterColor.lastIndexOf(',') + 1, baseWaterColor.indexOf(')')), 10);
      
      const r2 = parseInt(config.reflectionColor.slice(1, 3), 16);
      const g2 = parseInt(config.reflectionColor.slice(3, 5), 16);
      const b2 = parseInt(config.reflectionColor.slice(5, 7), 16);
      
      const r = Math.floor(r1 * (1 - reflectionIntensity) + r2 * reflectionIntensity);
      const g = Math.floor(g1 * (1 - reflectionIntensity) + g2 * reflectionIntensity);
      const b = Math.floor(b1 * (1 - reflectionIntensity) + b2 * reflectionIntensity);
      
      finalColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    // Add foam effect (overrides reflection)
    if (foamIntensity > 0.3) {
      // Create foam with varying opacity based on intensity
      const foamOpacity = Math.min(0.9, foamIntensity);
      
      // Simple color blending with foam
      const r1 = parseInt(finalColor.slice(4, finalColor.indexOf(',')), 10);
      const g1 = parseInt(finalColor.slice(finalColor.indexOf(',') + 1, finalColor.lastIndexOf(',')), 10);
      const b1 = parseInt(finalColor.slice(finalColor.lastIndexOf(',') + 1, finalColor.indexOf(')')), 10);
      
      const r2 = 255; // White foam
      const g2 = 255;
      const b2 = 255;
      
      const r = Math.floor(r1 * (1 - foamOpacity) + r2 * foamOpacity);
      const g = Math.floor(g1 * (1 - foamOpacity) + g2 * foamOpacity);
      const b = Math.floor(b1 * (1 - foamOpacity) + b2 * foamOpacity);
      
      finalColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    // Draw the pixel
    drawPixel(ctx, x + pixelX, pixelY, finalColor, config.pixelSize);
  }
};
/**
 * Creates small random reflection highlights
 */
const addReflectionHighlights = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  config: WaterConfig
): void => {
  // Only add highlights for stances with significant reflection
  if (config.reflectionIntensity < 0.4) return;
  
  const highlightCount = Math.floor(width / 40) * Math.floor(height / 40);
  const seed = Math.floor(progress * 10); // Change highlight positions over time
  
  ctx.fillStyle = config.reflectionColor;
  
  for (let i = 0; i < highlightCount; i++) {
    // Pseudorandom but deterministic positioning based on progress
    const hashBase = i * 13769 + seed * 31757;
    const randomX = x + (hashBase % 997) / 997 * width;
    const randomY = y + (hashBase % 1009) / 1009 * height;
    
    // Vary the size of highlights
    const size = config.pixelSize * (((hashBase % 5) + 1) / 3);
    
    // Only draw some of the potential highlights each frame
    if ((hashBase % 5) < 3) {
      ctx.fillRect(
        Math.floor(randomX / config.pixelSize) * config.pixelSize,
        Math.floor(randomY / config.pixelSize) * config.pixelSize,
        size,
        size
      );
    }
  }
};

// Export the Water2D asset
export const Water2D: Asset = {
  name: 'Water2D',
  
  description: `A simple 2D water asset in pixel art style.
  
# Visual style

Pixel art style water tile with enhanced depth and realistic wave animations.

# Projection

The water asset is designed for top down or pseudo isometric views.

# Stances / animations

- Default: Balanced water with gentle waves and subtle reflections
- Calm: Calm water with minimal ripples and increased reflections
- Windy: Choppy water with pronounced waves, dynamic foam effects and reduced reflections
  `,
  
  stances: ['default', 'calm', 'windy'],
  
  render: (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    progress: number, 
    stance: string, 
    direction: 'left' | 'right'
  ): void => {
    // Get configuration for the current stance
    const config = waterConfigs[stance] || waterConfigs.default;
    
    // Calculate how many lines to render based on pixel size
    const lineCount = Math.ceil(height / (config.pixelSize / 2));
    const lineSpacing = height / lineCount;
    
    // Render each horizontal line of water
    for (let i = 0; i < lineCount; i++) {
      const lineY = y + i * lineSpacing;
      renderWaterLine(
        ctx, 
        x, 
        y, 
        width, 
        lineY, 
        height, 
        progress + (i / lineCount * 0.2), // Slight phase offset for each line
        config
      );
    }
    
    // Add random reflection highlights
    addReflectionHighlights(ctx, x, y, width, height, progress, config);
    
    // For windy stance, add extra foam at the top
    if (stance === 'windy') {
      const foamHeight = height * 0.15;
      for (let foamX = 0; foamX < width; foamX += config.pixelSize) {
        // Create jagged foam edge
        const foamJaggedness = Math.sin(foamX * 0.1 + progress * Math.PI * 2) * 
                              Math.sin(foamX * 0.05 + progress * Math.PI * 4) * 
                              foamHeight * 0.7;
        
        const foamY = y + foamJaggedness;
        
        // Only draw foam with some randomization for a more natural look
        if (Math.sin(foamX * 0.3 + progress * 8) > 0.2) {
          const foamOpacity = 0.6 + Math.sin(foamX * 0.2 + progress * 6) * 0.4;
          ctx.fillStyle = `rgba(255, 255, 255, ${foamOpacity})`;
          ctx.fillRect(
            Math.floor(x + foamX / config.pixelSize) * config.pixelSize,
            Math.floor(foamY / config.pixelSize) * config.pixelSize,
            config.pixelSize,
            config.pixelSize
          );
        }
      }
    }
  }
};