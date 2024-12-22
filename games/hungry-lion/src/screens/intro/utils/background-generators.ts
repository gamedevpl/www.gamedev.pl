/**
 * Background configuration types
 */
export type BackgroundConfig = {
  // Sky colors for different times of day
  sky: {
    dawn: {
      start: string;
      end: string;
    };
    day: {
      start: string;
      end: string;
    };
    dusk: {
      start: string;
      end: string;
    };
    night: {
      start: string;
      end: string;
    };
  };
  // Dust particle effect configuration
  dustParticles: {
    count: number;
    minSize: number;
    maxSize: number;
    minOpacity: number;
    maxOpacity: number;
    speed: number;
    color: string;
  };
  // Terrain configuration
  terrain: {
    grassColor: string;
    groundColor: string;
    mountainColor: string;
    bushColors: string[];
  };
};

/**
 * Default configuration for the savanna background
 */
export const DEFAULT_CONFIG: BackgroundConfig = {
  sky: {
    dawn: {
      start: '#FF7F50',  // Coral orange
      end: '#FFD700'     // Golden yellow
    },
    day: {
      start: '#87CEEB',  // Sky blue
      end: '#4682B4'     // Steel blue
    },
    dusk: {
      start: '#FF4500',  // Orange red
      end: '#4B0082'     // Indigo
    },
    night: {
      start: '#191970',  // Midnight blue
      end: '#000033'     // Dark blue
    }
  },
  dustParticles: {
    count: 50,
    minSize: 1,
    maxSize: 3,
    minOpacity: 0.2,
    maxOpacity: 0.6,
    speed: 1,
    color: '#D2B48C'     // Tan color for dust
  },
  terrain: {
    grassColor: '#DAA520',    // Golden rod for savanna grass
    groundColor: '#8B4513',   // Saddle brown for ground
    mountainColor: '#A0522D', // Sienna for distant mountains
    bushColors: [
      '#556B2F',  // Dark olive green
      '#6B8E23',  // Olive drab
      '#808000'   // Olive
    ]
  }
};

/**
 * Calculates the current background colors based on time of day
 * @param time Current time in milliseconds
 * @returns Background gradient colors
 */
export function calculateBackgroundColors(time: number): { start: string; end: string } {
  const hour = new Date(time).getHours();

  if (hour >= 5 && hour < 7) {
    return DEFAULT_CONFIG.sky.dawn;
  } else if (hour >= 7 && hour < 17) {
    return DEFAULT_CONFIG.sky.day;
  } else if (hour >= 17 && hour < 19) {
    return DEFAULT_CONFIG.sky.dusk;
  } else {
    return DEFAULT_CONFIG.sky.night;
  }
}

/**
 * Generates dust particle parameters
 * @returns Dust particle configuration
 */
export function generateDustParticle() {
  const { dustParticles } = DEFAULT_CONFIG;
  return {
    size: Math.random() * (dustParticles.maxSize - dustParticles.minSize) + dustParticles.minSize,
    opacity: Math.random() * (dustParticles.maxOpacity - dustParticles.minOpacity) + dustParticles.minOpacity,
    x: Math.random() * 100, // percentage across screen
    y: Math.random() * 100, // percentage down screen
    speed: Math.random() * dustParticles.speed + 0.5,
    color: dustParticles.color
  };
}

/**
 * Generates terrain elements for the background
 * @returns Array of terrain element configurations
 */
export function generateTerrainElements() {
  const { terrain } = DEFAULT_CONFIG;
  return {
    grass: {
      color: terrain.grassColor,
      height: Math.random() * 20 + 10 // Random height between 10 and 30
    },
    bushes: terrain.bushColors.map(color => ({
      color,
      size: Math.random() * 30 + 20, // Random size between 20 and 50
      x: Math.random() * 100 // Random position across screen
    })),
    mountains: Array.from({ length: 3 }, () => ({
      color: terrain.mountainColor,
      height: Math.random() * 30 + 20, // Random height between 20 and 50
      x: Math.random() * 100 // Random position across screen
    }))
  };
}