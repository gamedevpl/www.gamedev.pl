import { useEffect, useState } from 'react';

/**
 * Interface defining the development configuration options
 */
export interface DevConfig {
  // AI Features
  enableAISantas: boolean;

  // Rendering Features
  renderSnow: boolean;
  renderFire: boolean;
  renderTrees: boolean;
  renderMountains: boolean;
  renderSnowGround: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: DevConfig = {
  enableAISantas: true,
  renderSnow: true,
  renderFire: true,
  renderTrees: true,
  renderMountains: true,
  renderSnowGround: true,
};

/**
 * Custom event for config updates
 */
const CONFIG_UPDATE_EVENT = 'devConfigUpdate';

/**
 * Event interface for config updates
 */
interface DevConfigUpdateEvent extends CustomEvent {
  detail: Partial<DevConfig>;
}

/**
 * Class managing the development configuration
 */
class DevConfigManager {
  private config: DevConfig;
  private listeners: Set<(config: DevConfig) => void>;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.listeners = new Set();
    this.initHashListener();
  }

  /**
   * Initialize hash change listener for dev mode
   */
  private initHashListener() {
    window.addEventListener('hashchange', this.checkDevMode.bind(this));
    this.checkDevMode(); // Initial check
  }

  /**
   * Check if dev mode is enabled via URL hash
   */
  private checkDevMode() {
    const isDevMode = window.location.hash.includes('#dev');
    if (!isDevMode) {
      // Reset to default config when dev mode is disabled
      this.updateConfig(DEFAULT_CONFIG);
    }
  }

  /**
   * Get current configuration state
   */
  getConfig(): Readonly<DevConfig> {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DevConfig>) {
    this.config = {
      ...this.config,
      ...updates,
    };

    // Notify all listeners
    this.listeners.forEach((listener) => listener(this.getConfig()));

    // Dispatch custom event
    const event = new CustomEvent(CONFIG_UPDATE_EVENT, {
      detail: updates,
    }) as DevConfigUpdateEvent;
    window.dispatchEvent(event);
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(listener: (config: DevConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check if dev mode is currently active
   */
  isDevMode(): boolean {
    return window.location.hash.includes('#dev');
  }
}

// Create singleton instance
export const devConfig = new DevConfigManager();

/**
 * React hook for accessing dev configuration
 */
export function useDevConfig(): [DevConfig, (updates: Partial<DevConfig>) => void] {
  const [config, setConfig] = useState<DevConfig>(devConfig.getConfig());

  useEffect(() => {
    // Subscribe to config updates
    const unsubscribe = devConfig.subscribe((newConfig) => {
      setConfig(newConfig);
    });

    return unsubscribe;
  }, []);

  return [config, (updates) => devConfig.updateConfig(updates)];
}

/**
 * React hook for checking dev mode status
 */
export function useDevMode(): boolean {
  const [isDevMode, setIsDevMode] = useState(devConfig.isDevMode());

  useEffect(() => {
    const handleHashChange = () => {
      setIsDevMode(devConfig.isDevMode());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return isDevMode;
}
