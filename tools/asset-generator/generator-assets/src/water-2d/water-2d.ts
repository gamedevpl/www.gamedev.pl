import { Asset } from '../../../generator-core/src/assets-types';

// Types for water configuration
type WaterConfig = {
  baseColor: string;
  highlightColor: string;
  shadowColor: string;
  depthColor: string; // For deeper water areas
  foamColor: string; // For foam/crest effect
  pixelSize: number;
  waveAmplitude: number;
  waveFrequency: number;
  waveSpeed: number;
  depthVariation: number; // Controls depth variation effect
  foamIntensity: number; // Controls amount of foam/white caps
  rippleDensity: number; // Controls density of surface ripples
  seamlessTiling: boolean; // Controls whether water tiles seamlessly
  reflectionIntensity?: number; // Controls water surface reflections
  refractionStrength?: number; // Controls light refraction through water
  wavePattern?: WavePattern; // Controls the pattern of waves (enhanced for windy stance)
};

// Wave pattern configuration for more varied wave effects
type WavePattern = {
  complexity: number; // How complex the wave pattern is (1-5)
  directionality: number; // How directional the waves are (0-1)
  choppiness: number; // How choppy/irregular the waves are (0-1)
  harmonics: number[]; // Harmonic frequencies to add to the wave
};
// Standardized water colors with enhanced palette for more depth and realism
const WATER_COLORS = {
  default: {
    baseColor: 'rgb(65, 105, 225)', // Royal blue
    highlightColor: 'rgb(120, 169, 255)', // Lighter blue (brightened for better contrast)
    shadowColor: 'rgb(25, 25, 112)', // Midnight blue
    depthColor: 'rgb(10, 20, 80)', // Deep blue for depth
    foamColor: 'rgb(240, 248, 255)', // Alice blue for foam
  },
  calm: {
    baseColor: 'rgb(65, 105, 225)', // Standardized to match default for cohesive style
    highlightColor: 'rgb(130, 180, 235)', // Subtle highlight for calm water
    shadowColor: 'rgb(25, 25, 112)', // Standardized shadow color
    depthColor: 'rgb(15, 30, 90)', // Slightly lighter than default for calm water
    foamColor: 'rgb(235, 245, 255)', // Subtle foam color
  },
  windy: {
    baseColor: 'rgb(55, 95, 215)', // Slightly darker base for windy conditions
    highlightColor: 'rgb(150, 200, 255)', // Brighter highlights for wave crests
    shadowColor: 'rgb(20, 20, 100)', // Standardized shadow with slight variation
    depthColor: 'rgb(5, 15, 70)', // Deeper color for windy conditions
    foamColor: 'rgb(255, 255, 255)', // White foam for waves
  },
};

// Wave pattern configurations for different stances
const WAVE_PATTERNS: Record<string, WavePattern> = {
  default: {
    complexity: 2,
    directionality: 0.5,
    choppiness: 0.3,
    harmonics: [1, 0.5, 0.25],
  },
  calm: {
    complexity: 1,
    directionality: 0.2,
    choppiness: 0.1,
    harmonics: [1, 0.3],
  },
  windy: {
    complexity: 4,
    directionality: 0.8,
    choppiness: 0.9,
    harmonics: [1, 0.7, 0.5, 0.3, 0.2],
  },
};
// Configuration for different water stances with enhanced differentiation
const WATER_STANCE_CONFIG: Record<string, Partial<WaterConfig>> = {
  default: {
    pixelSize: 4,
    waveAmplitude: 2.5, // Slightly increased for better visibility
    waveFrequency: 1,
    waveSpeed: 0.5,
    depthVariation: 0.3,
    foamIntensity: 0.2,
    rippleDensity: 0.5,
    seamlessTiling: true,
    reflectionIntensity: 0.3,
    refractionStrength: 0.2,
    wavePattern: WAVE_PATTERNS.default,
  },
  calm: {
    pixelSize: 4,
    waveAmplitude: 0.8, // Reduced for calmer appearance
    waveFrequency: 0.4, // Lower frequency for gentler waves
    waveSpeed: 0.25, // Slower movement
    depthVariation: 0.15, // Less depth variation
    foamIntensity: 0.05, // Minimal foam
    rippleDensity: 0.2, // Fewer ripples
    seamlessTiling: true,
    reflectionIntensity: 0.5, // More reflective when calm
    refractionStrength: 0.1,
    wavePattern: WAVE_PATTERNS.calm,
  },
  windy: {
    pixelSize: 3,
    waveAmplitude: 6, // Significantly increased for dramatic waves
    waveFrequency: 3, // Higher frequency for choppier water
    waveSpeed: 1.8, // Faster animation for windy conditions
    depthVariation: 0.6, // More depth variation
    foamIntensity: 0.8, // High foam for windy water
    rippleDensity: 0.9, // Many ripples
    seamlessTiling: true,
    reflectionIntensity: 0.1, // Less reflection in choppy water
    refractionStrength: 0.3, // More refraction in disturbed water
    wavePattern: WAVE_PATTERNS.windy,
  },
};

// Cache for ripple positions and colors to avoid recalculating every frame
interface RippleCache {
  positions: Array<{x: number, y: number, width: number}>;
  colors: string[];
  timestamp: number;
  stance: string;
}

const rippleCache: RippleCache = {
  positions: [],
  colors: [],
  timestamp: -1,
  stance: ''
};

// Foam particle system for more dynamic foam effects
interface FoamParticle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}
const foamParticles: FoamParticle[] = [];

// Reflection distortion data for calm water
interface ReflectionDistortion {
  x: number;
  amplitude: number;
  frequency: number;
  phase: number;
}

const reflectionDistortions: ReflectionDistortion[] = [];

/**
 * Draws a pixel art style water with animated waves
 */
function drawWater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  stance: string,
) {
  // Get configuration for the current stance
  const stanceKey = WATER_STANCE_CONFIG[stance] ? stance : 'default';
  const colors = WATER_COLORS[stanceKey as keyof typeof WATER_COLORS];
  const config = {
    ...WATER_STANCE_CONFIG[stanceKey],
    baseColor: colors.baseColor,
    highlightColor: colors.highlightColor,
    shadowColor: colors.shadowColor,
    depthColor: colors.depthColor,
    foamColor: colors.foamColor,
  } as WaterConfig;

  // Draw the water base
  ctx.save();
  ctx.fillStyle = config.baseColor;
  ctx.fillRect(x, y, width, height);

  // Draw pixel art water pattern with enhanced effects
  drawPixelArtWater(ctx, x, y, width, height, progress, config);

  // Draw reflections if enabled (enhanced for calm water)
  if (config.reflectionIntensity && config.reflectionIntensity > 0) {
    drawWaterReflections(ctx, x, y, width, height, progress, config);
  }

  ctx.restore();
}
/**
 * Draws pixel art style water with animated waves
 * Enhanced with depth variation, improved wave algorithms, and varied wave patterns
 */
function drawPixelArtWater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  config: WaterConfig,
) {
  const { pixelSize, waveAmplitude, waveFrequency, waveSpeed, depthVariation, seamlessTiling, wavePattern } = config;

  // Calculate number of pixels in grid
  const numPixelsX = Math.ceil(width / pixelSize);
  const numPixelsY = Math.ceil(height / pixelSize);

  // Create a continuous animation by ensuring progress transitions smoothly
  const smoothProgress = progress % 1.0; // Ensures values between 0 and 1

  // Use wave pattern if available, or default values if not
  const complexity = wavePattern?.complexity || 2;
  const directionality = wavePattern?.directionality || 0.5;
  const choppiness = wavePattern?.choppiness || 0.3;
  const harmonics = wavePattern?.harmonics || [1, 0.5, 0.25];

  // Draw pixel by pixel
  for (let py = 0; py < numPixelsY; py++) {
    for (let px = 0; px < numPixelsX; px++) {
      const pixelX = x + px * pixelSize;
      const pixelY = y + py * pixelSize;

      // Skip pixels that would be drawn outside the target area
      if (pixelX >= x + width || pixelY >= y + height) continue;

      // Calculate normalized position for seamless tiling
      let normalizedX = px;
      let normalizedY = py;

      if (seamlessTiling) {
        normalizedX = (px % (numPixelsX / 2)) * 2; // Repeat pattern horizontally
        normalizedY = py; // Keep vertical position
      }

      // Create enhanced wave effect based on position and time
      const wavePhase = smoothProgress * waveSpeed * Math.PI * 2;
      
      // Apply directional bias to create more directional waves
      const directionalX = normalizedX + normalizedY * directionality;
      const directionalY = normalizedY + normalizedX * (1 - directionality);
      
      // Combine multiple wave harmonics for more complex patterns
      let waveValue = 0;
      for (let i = 0; i < complexity && i < harmonics.length; i++) {
        const harmonic = harmonics[i];
        const harmonicFreq = waveFrequency * harmonic;
        
        // Add positional variation based on choppiness for irregular waves
        const choppyOffset = choppiness > 0 
          ? Math.sin(directionalX * 0.1 + directionalY * 0.13 + i) * choppiness 
          : 0;
        
        const waveX = Math.sin((directionalX / harmonicFreq + wavePhase + choppyOffset) * (1 + i * 0.1));
        const waveY = Math.cos((directionalY / harmonicFreq + wavePhase * 0.7 + choppyOffset) * (1 + i * 0.05));
        const waveZ = Math.sin(((directionalX + directionalY) / (harmonicFreq * 1.3) + wavePhase * 1.2) * (1 + i * 0.07));
        
        // Weight each harmonic by its value in the harmonics array
        waveValue += (waveX + waveY + waveZ) * harmonic;
      }
      
      // Normalize wave value based on complexity
      waveValue = (waveValue / (complexity * 3)) * waveAmplitude;

      // Add depth variation based on Y position
      const depthFactor = Math.min(1, py / (numPixelsY * 0.7)) * depthVariation;

      // Determine pixel color based on wave value and depth
      let pixelColor: string;

      if (waveValue > waveAmplitude * 0.7) {
        // Wave crests
        pixelColor = config.highlightColor;

        // Add foam to the crests of waves in windy conditions
        if (waveValue > waveAmplitude * 0.9 && Math.random() < config.foamIntensity) {
          pixelColor = config.foamColor;
          
          // Potentially create a foam particle for dynamic foam effect
          if (config.foamIntensity > 0.5 && Math.random() < 0.1) {
            createFoamParticle(pixelX, pixelY, pixelSize, config);
          }
        }
      } else if (waveValue < -waveAmplitude * 0.7) {
        // Wave troughs
        pixelColor = config.shadowColor;

        // Add deeper color to the troughs for more depth
        if (depthFactor > 0.5 && py > numPixelsY / 2) {
          pixelColor = config.depthColor;
        }
      } else {
        // Middle areas
        pixelColor = config.baseColor;

        // Add depth variation
        if (depthFactor > 0.7 && Math.random() < depthFactor) {
          pixelColor = config.shadowColor;
        }
      }

      // Apply some variation based on position for more natural look
      if ((px + py) % 7 === 0 && py > numPixelsY / 2) {
        // Mix in some shadow color for texture
        if (Math.random() < 0.7) {
          pixelColor = config.shadowColor;
        }
      }

      // Apply refraction effect if enabled
      if (config.refractionStrength && config.refractionStrength > 0) {
        // Simple refraction simulation - shift deeper pixels slightly based on wave value
        if (py > numPixelsY / 3 && Math.abs(waveValue) > waveAmplitude * 0.3) {
          const refractionOffset = waveValue * config.refractionStrength;
          // Skip this pixel and draw it with offset if it would create a refraction effect
          if (refractionOffset > pixelSize / 2) {
            continue;
          }
        }
      }

      // Draw the pixel
      ctx.fillStyle = pixelColor;
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
    }
  }

  // Add surface highlights for more water-like appearance
  drawWaterSurface(ctx, x, y, width, height, smoothProgress, config);
  
  // Draw foam particles
  drawFoamParticles(ctx, x, y, width, height, config);
}
/**
 * Creates a foam particle for dynamic foam effects
 */
function createFoamParticle(x: number, y: number, size: number, config: WaterConfig) {
  // Only create particles if we don't have too many already
  if (foamParticles.length < 50) {
    foamParticles.push({
      x,
      y,
      size: size * (0.5 + Math.random() * 0.5),
      speed: 0.2 + Math.random() * 0.3,
      opacity: 0.6 + Math.random() * 0.4
    });
  }
}

/**
 * Draws and updates foam particles
 */
function drawFoamParticles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  config: WaterConfig
) {
  // Skip if foam intensity is low
  if (config.foamIntensity < 0.4) {
    foamParticles.length = 0; // Clear particles when not needed
    return;
  }
  
  ctx.fillStyle = config.foamColor;
  
  // Process each particle
  for (let i = foamParticles.length - 1; i >= 0; i--) {
    const particle = foamParticles[i];
    
    // Update particle position
    particle.y -= particle.speed;
    particle.opacity -= 0.01;
    
    // Remove particles that have faded or moved off-screen
    if (particle.opacity <= 0 || particle.y < y || particle.y > y + height) {
      foamParticles.splice(i, 1);
      continue;
    }
    
    // Draw the particle
    ctx.globalAlpha = particle.opacity;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.globalAlpha = 1.0;
}

/**
 * Initializes reflection distortion data for calm water
 */
function initReflectionDistortions(width: number) {
  // Clear existing distortions
  reflectionDistortions.length = 0;
  
  // Create distortion points across the width
  const numDistortions = Math.ceil(width / 40);
  
  for (let i = 0; i < numDistortions; i++) {
    reflectionDistortions.push({
      x: i * (width / numDistortions),
      amplitude: 0.5 + Math.random() * 1.5,
      frequency: 0.2 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2
    });
  }
}

/**
 * Draws water reflections on the surface with enhanced distortion for calm water
 */
function drawWaterReflections(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  config: WaterConfig
) {
  if (!config.reflectionIntensity) return;
  
  const reflectionHeight = height * 0.3; // Reflections appear in top 30% of water
  const isCalm = config.waveAmplitude < 1.5; // Check if this is calm water
  
  // Initialize distortion data if needed for calm water
  if (isCalm && reflectionDistortions.length === 0) {
    initReflectionDistortions(width);
  }
  
  // Create horizontal reflection lines
  ctx.globalAlpha = config.reflectionIntensity * 0.3;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  
  // Draw reflection lines with wave distortion
  const lineCount = Math.floor(reflectionHeight / (config.pixelSize * 2));
  const wavePhase = progress * config.waveSpeed * Math.PI;
  
  for (let i = 0; i < lineCount; i++) {
    const yPos = y + i * config.pixelSize * 2;
    const waveOffset = Math.sin(wavePhase + i * 0.2) * config.waveAmplitude * 0.5;
    
    // Draw a wavy reflection line
    ctx.beginPath();
    ctx.moveTo(x, yPos);
    
    // For calm water, use enhanced distortion system
    if (isCalm) {
      const distortionSpeed = progress * 0.2;
      
      for (let xPos = x; xPos <= x + width; xPos += config.pixelSize) {
        let localDistortion = 0;
        
        // Calculate distortion from all influence points
        for (const distortion of reflectionDistortions) {
          const distance = Math.abs(xPos - (x + distortion.x));
          const influence = Math.max(0, 1 - distance / (width / 4));
          
          if (influence > 0) {
            localDistortion += Math.sin(
              distortion.frequency * distance + 
              distortion.phase + 
              distortionSpeed
            ) * distortion.amplitude * influence;
          }
        }
        
        // Apply the distortion to the y position
        const distortedY = yPos + localDistortion * config.pixelSize * 0.3;
        
        if (xPos === x) {
          ctx.moveTo(xPos, distortedY);
        } else {
          ctx.lineTo(xPos, distortedY);
        }
      }
    } 
    // For non-calm water, use simpler wave distortion
    else {
      for (let xPos = x; xPos < x + width; xPos += config.pixelSize) {
        const localWave = Math.sin(xPos * 0.05 + wavePhase) * config.waveAmplitude * 0.3;
        ctx.lineTo(xPos, yPos + localWave + waveOffset);
      }
    }
    
    ctx.lineTo(x + width, yPos);
    ctx.closePath();
    ctx.fill();
  }
  
  // Add subtle highlight spots for calm water reflections
  if (isCalm && config.reflectionIntensity > 0.4) {
    ctx.globalAlpha = config.reflectionIntensity * 0.2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    
    const spotCount = Math.floor(width / 60);
    for (let i = 0; i < spotCount; i++) {
      const spotX = x + Math.random() * width;
      const spotY = y + Math.random() * (reflectionHeight * 0.8);
      const spotSize = config.pixelSize * (1 + Math.random() * 2);
      
      ctx.beginPath();
      ctx.arc(spotX, spotY, spotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.globalAlpha = 1.0;
}
/**
 * Draws water surface highlights and ripples
 * Enhanced with variable ripple density, foam patterns, and optimized drawing
 */
function drawWaterSurface(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  config: WaterConfig,
) {
  // Calculate a cache key based on the current animation frame and stance
  const cacheKey = Math.floor(progress * 100);
  
  // Check if we need to regenerate the ripple cache
  if (rippleCache.timestamp !== cacheKey || rippleCache.stance !== config.baseColor) {
    // Generate new ripple positions and colors
    generateRippleCache(x, y, width, height, progress, config);
    rippleCache.timestamp = cacheKey;
    rippleCache.stance = config.baseColor;
  }
  
  // Draw ripples using the cached positions
  ctx.globalAlpha = 0.3;
  
  // Use a single path for all ripples of the same color to reduce draw calls
  const colorGroups: Record<string, Array<{x: number, y: number, width: number}>> = {};
  
  // Group ripples by color
  for (let i = 0; i < rippleCache.positions.length; i++) {
    const color = rippleCache.colors[i];
    if (!colorGroups[color]) {
      colorGroups[color] = [];
    }
    colorGroups[color].push(rippleCache.positions[i]);
  }
  
  // Draw each color group with a single path
  for (const color in colorGroups) {
    ctx.fillStyle = color;
    ctx.beginPath();
    
    for (const ripple of colorGroups[color]) {
      // Draw ripple segment
      ctx.rect(ripple.x, ripple.y, ripple.width, 1);
    }
    
    ctx.fill();
  }

  // Add foam patches for windy water
  if (config.foamIntensity > 0.4) {
    ctx.fillStyle = config.foamColor;
    ctx.globalAlpha = 0.2 + config.foamIntensity * 0.3;
    
    // Use a single path for all foam patches to reduce draw calls
    ctx.beginPath();
    
    // Number of foam patches - increased for windy water to make it more dynamic
    const foamPatches = Math.floor((width / (config.pixelSize * 10)) * config.foamIntensity * 1.5);
    
    for (let i = 0; i < foamPatches; i++) {
      const foamX = x + Math.random() * width;
      const foamY = y + Math.random() * (height * 0.3); // Foam mostly at top
      const foamSize = config.pixelSize * (1 + Math.random() * 3);
      
      // Add to the foam path
      ctx.moveTo(foamX + foamSize, foamY);
      ctx.arc(foamX, foamY, foamSize, 0, Math.PI * 2);
    }
    
    ctx.fill();
  }

  ctx.globalAlpha = 1.0;
}

/**
 * Generates and caches ripple positions and colors
 * Enhanced with more variation for windy water
 */
function generateRippleCache(
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  config: WaterConfig
) {
  const { pixelSize, waveSpeed, waveFrequency, foamIntensity, rippleDensity, wavePattern } = config;
  const isWindy = wavePattern?.choppiness && wavePattern.choppiness > 0.7;
  
  // Clear previous cache
  rippleCache.positions = [];
  rippleCache.colors = [];
  
  // Number of ripple lines to draw - adjusted by rippleDensity
  const numRipples = Math.floor((height / (pixelSize * 3)) * rippleDensity);
  
  // Generate ripple positions and colors
  for (let i = 0; i < numRipples; i++) {
    // Alternate ripple colors between highlight and foam
    const rippleColor = i % 3 === 0 && foamIntensity > 0.3 ? config.foamColor : config.highlightColor;
    
    // Calculate ripple position with enhanced animation
    const ripplePhase = progress * waveSpeed * Math.PI * 2;
    
    // Add more variation to ripple positioning for windy water
    const yVariation = isWindy ? Math.sin(i * 0.3) * pixelSize * 3 : Math.sin(i * 0.1) * pixelSize * 2;
    const rippleY = y + i * pixelSize * 3 + yVariation + 
      Math.sin(ripplePhase + i / waveFrequency) * pixelSize * (isWindy ? 2.5 : 1.5);
    
    // Skip if outside the water area
    if (rippleY < y || rippleY >= y + height) continue;
    
    // Create ripple segments with varying lengths and positions
    for (let px = 0; px < width / pixelSize; px++) {
      // Add variation based on stance - more gaps in calm water, fewer in windy
      const gapProbability = isWindy ? 0.2 : 0.4;
      if (Math.random() > gapProbability + rippleDensity * 0.5) continue;
      
      // Longer ripple segments for windy water
      const rippleWidth = pixelSize * (1 + Math.floor(Math.random() * (isWindy ? 3 : 2)));
      
      // Vary ripple position slightly for more natural look
      const rippleX = x + px * pixelSize + (Math.random() - 0.5) * pixelSize * (isWindy ? 2 : 1);
      
      // Add to cache
      rippleCache.positions.push({ x: rippleX, y: rippleY, width: rippleWidth });
      rippleCache.colors.push(rippleColor);
    }
  }
}
export const Water2d: Asset = {
  name: 'Water2d',
  description: `A simple 2D water asset in pixel art style.
  
# Visual style

Pixel art style water tile with enhanced depth and realistic wave animations.

# Stances / animations

- Default: Balanced water with gentle waves and subtle reflections
- Calm: Calm water with minimal ripples and increased reflections
- Windy: Choppy water with pronounced waves, dynamic foam effects and reduced reflections
  `,
  stances: ['default', 'calm', 'windy'],
  render: (ctx, x, y, width, height, progress, stance, direction) => {
    // Direction is not used for water, but we keep the parameter to match the Asset interface
    drawWater(ctx, x, y, width, height, progress, stance);
  },
};