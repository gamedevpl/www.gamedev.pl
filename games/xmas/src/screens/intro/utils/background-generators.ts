/**
 * Types for background elements
 */
export interface Snowflake {
  id: number;
  delay: number;
  size: number;
  left: number;
}

export interface Star {
  id: number;
  top: number;
  left: number;
  size: number;
}

export interface Tree {
  id: number;
  scale: number;
  left: number;
  bottom: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  snowflakes: {
    count: 50,
    minSize: 2,
    maxSize: 6,
    maxDelay: 5,
  },
  stars: {
    count: 15,
    minSize: 2,
    maxSize: 6,
    maxTop: 40,
  },
  trees: {
    count: 8,
    minScale: 0.5,
    maxScale: 1.5,
    spacing: 15,
    randomOffset: 10,
    maxBottom: 15,
  },
} as const;

/**
 * Generates an array of snowflake objects with random properties
 * @param count Number of snowflakes to generate
 * @param config Optional configuration parameters
 * @returns Array of Snowflake objects
 */
export const generateSnowflakes = (
  count: number = DEFAULT_CONFIG.snowflakes.count,
  config = DEFAULT_CONFIG.snowflakes
): Snowflake[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    delay: Math.random() * config.maxDelay,
    size: config.minSize + Math.random() * (config.maxSize - config.minSize),
    left: Math.random() * 100,
  }));
};

/**
 * Generates an array of star objects with random properties
 * @param count Number of stars to generate
 * @param config Optional configuration parameters
 * @returns Array of Star objects
 */
export const generateStars = (
  count: number = DEFAULT_CONFIG.stars.count,
  config = DEFAULT_CONFIG.stars
): Star[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: Math.random() * config.maxTop,
    left: Math.random() * 100,
    size: config.minSize + Math.random() * (config.maxSize - config.minSize),
  }));
};

/**
 * Generates an array of tree objects with random properties
 * @param count Number of trees to generate
 * @param config Optional configuration parameters
 * @returns Array of Tree objects
 */
export const generateTrees = (
  count: number = DEFAULT_CONFIG.trees.count,
  config = DEFAULT_CONFIG.trees
): Tree[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    scale: config.minScale + Math.random() * (config.maxScale - config.minScale),
    left: (i * config.spacing) + Math.random() * config.randomOffset,
    bottom: Math.random() * config.maxBottom,
  }));
};

/**
 * Generates all background elements at once
 * @param config Optional configuration object
 * @returns Object containing arrays of all background elements
 */
export const generateAllBackgroundElements = (config = DEFAULT_CONFIG) => {
  return {
    snowflakes: generateSnowflakes(config.snowflakes.count, config.snowflakes),
    stars: generateStars(config.stars.count, config.stars),
    trees: generateTrees(config.trees.count, config.trees),
  };
};