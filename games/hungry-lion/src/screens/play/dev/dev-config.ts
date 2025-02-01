/**
 * Interface defining the development configuration options
 */
export interface DevConfig {
  // Setting to enable debug rendering of vital information
  debugVitals: boolean;

  // Setting to enable state machine debugging
  debugStateMachine: boolean;

  // Metrics collection settings
  metricsEnabled: boolean;
  metricsTimeWindow: number;
  metricsMaxPayloadSize: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: DevConfig = {
  debugVitals: false,
  debugStateMachine: false,
  // Default metrics settings
  metricsEnabled: false,
  metricsTimeWindow: 10000, // 10 seconds
  metricsMaxPayloadSize: 2048, // characters
};

/**
 * Serializes configuration object to URL hash string
 */
function serializeConfig(config: DevConfig): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) {
    params.set(key, String(value));
  }
  return `#dev?${params.toString()}`;
}

/**
 * Deserializes configuration from URL hash string
 */
function deserializeConfig(hash: string): Partial<DevConfig> {
  try {
    const match = hash.match(/#dev\\?(.*)/);
    if (!match) return {};

    const params = new URLSearchParams(match[1]);
    const config: Partial<DevConfig> = {};

    params.forEach((value, key) => {
      if (key in DEFAULT_CONFIG) {
        if (key === 'metricsTimeWindow' || key === 'metricsMaxPayloadSize') {
          config[key] = Number(value);
        } else {
          const boolKey = key as keyof Omit<DevConfig, 'metricsTimeWindow' | 'metricsMaxPayloadSize'>;
          config[boolKey] = value === 'true';
        }
      }
    });
    return config;
  } catch (e) {
    console.warn('Failed to parse dev config from hash:', e);
    return {};
  }
}

export const setDevConfig = (config: Partial<DevConfig>) => {
  Object.assign(devConfig, config);
  const newHash = serializeConfig(devConfig);
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash);
  }
};

export const getDevMode = () => window.location.hash.startsWith('#dev');

export const setDevMode = (enabled: boolean) => {
  if (enabled) {
    window.location.hash = '#dev';
  } else {
    window.location.hash = '';
  }
};

/**
 * Export a singleton instance of the configuration manager
 */
export const devConfig: DevConfig = getDevMode()
  ? { ...DEFAULT_CONFIG, ...deserializeConfig(window.location.hash) }
  : { ...DEFAULT_CONFIG };
