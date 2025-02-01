import { devConfig } from '../../screens/play/dev/dev-config';
import { updateAppContext } from '../genaicode-context';

/**
 * Raw metrics data collected during gameplay
 */
interface RawMetrics {
  /** Time when the metrics were collected */
  timestamp: number;
  /** Type of event that generated these metrics */
  type: 'flee' | 'catch';
  /** Data specific to the event type */
  data: {
    /** Lion's hunger level at the time of catch (only for catch events) */
    hungerLevel?: number;
  };
}

/**
 * Aggregated metrics data ready to be sent to GenAIcode
 */
interface AggregatedMetrics {
  /** Time window start timestamp */
  startTime: number;
  /** Time window end timestamp */
  endTime: number;
  /** Number of flee events in the time window */
  fleeCount: number;
  /** Number of catch events in the time window */
  catchCount: number;
  /** Average lion hunger level at catch during the time window */
  avgHungerAtCatch: number;
  /** Catch success rate (catches / flee events) */
  catchRate: number;
}

/**
 * Circular buffer implementation for storing metrics data
 */
class CircularBuffer<T> {
  private buffer: T[];
  private start: number = 0;
  private size: number = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  /**
   * Add an item to the buffer
   */
  push(item: T): void {
    const index = (this.start + this.size) % this.capacity;
    this.buffer[index] = item;
    
    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full, move start pointer
      this.start = (this.start + 1) % this.capacity;
    }
  }

  /**
   * Get all items in the buffer
   */
  getItems(): T[] {
    const items: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.start + i) % this.capacity;
      items.push(this.buffer[index]);
    }
    return items;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.start = 0;
    this.size = 0;
  }
}

/**
 * Class responsible for collecting and aggregating gameplay metrics
 */
class MetricsAggregator {
  /** Buffer for storing raw metrics data */
  private metricsBuffer: CircularBuffer<RawMetrics>;
  /** Last time metrics were sent to GenAIcode */
  private lastSendTime: number = 0;
  /** Default buffer capacity (store up to 1000 events) */
  private readonly DEFAULT_BUFFER_CAPACITY = 1000;
  /** Flag to track initialization status */
  private initialized: boolean = false;

  constructor() {
    this.metricsBuffer = new CircularBuffer<RawMetrics>(this.DEFAULT_BUFFER_CAPACITY);
  }

  /**
   * Initialize the aggregator with the current time
   */
  private initialize(currentTime: number): void {
    if (!this.initialized) {
      this.lastSendTime = currentTime;
      this.initialized = true;
    }
  }

  /**
   * Record a flee event
   */
  recordFleeEvent(): void {
    if (!devConfig.metricsEnabled) return;

    const currentTime = performance.now();
    this.initialize(currentTime);

    this.metricsBuffer.push({
      timestamp: currentTime,
      type: 'flee',
      data: {}
    });
  }

  /**
   * Record a catch event
   */
  recordCatchEvent(hungerLevel: number): void {
    if (!devConfig.metricsEnabled) return;

    const currentTime = performance.now();
    this.initialize(currentTime);

    this.metricsBuffer.push({
      timestamp: currentTime,
      type: 'catch',
      data: {
        hungerLevel
      }
    });
  }

  /**
   * Aggregate metrics from the buffer within the specified time window
   */
  private aggregateMetrics(startTime: number, endTime: number): AggregatedMetrics {
    const items = this.metricsBuffer.getItems()
      .filter(item => item.timestamp >= startTime && item.timestamp <= endTime);

    const fleeEvents = items.filter(item => item.type === 'flee');
    const catchEvents = items.filter(item => item.type === 'catch');

    const hungerLevels = catchEvents
      .map(event => event.data.hungerLevel)
      .filter((level): level is number => level !== undefined);

    const avgHunger = hungerLevels.length > 0
      ? hungerLevels.reduce((sum, level) => sum + level, 0) / hungerLevels.length
      : 0;

    return {
      startTime,
      endTime,
      fleeCount: fleeEvents.length,
      catchCount: catchEvents.length,
      avgHungerAtCatch: avgHunger,
      catchRate: fleeEvents.length > 0 ? catchEvents.length / fleeEvents.length : 0
    };
  }

  /**
   * Check if the payload size is within limits
   */
  private checkPayloadSize(metrics: AggregatedMetrics): boolean {
    const payload = JSON.stringify(metrics);
    return payload.length <= devConfig.metricsMaxPayloadSize;
  }

  /**
   * Aggregate and send metrics to GenAIcode if the time window has elapsed
   */
  async aggregateAndSend(): Promise<void> {
    if (!devConfig.metricsEnabled || !this.initialized) return;

    const currentTime = performance.now();
    const timeWindow = devConfig.metricsTimeWindow;

    // Check if it's time to send metrics
    if (currentTime - this.lastSendTime >= timeWindow) {
      try {
        // Aggregate metrics for the time window
        const metrics = this.aggregateMetrics(this.lastSendTime, currentTime);

        // Check payload size
        if (!this.checkPayloadSize(metrics)) {
          console.warn('Metrics payload size exceeds limit, skipping...');
          return;
        }

        // Send metrics to GenAIcode
        await updateAppContext('gameMetrics', JSON.stringify(metrics));

        // Update last send time and clear old data
        this.lastSendTime = currentTime;
        this.metricsBuffer.clear();
      } catch (error) {
        console.error('Failed to send metrics to GenAIcode:', error);
      }
    }
  }
}

// Export a singleton instance
export const metricsAggregator = new MetricsAggregator();