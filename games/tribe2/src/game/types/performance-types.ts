/**
 * Performance tracking structures.
 */
export type PerformanceMetricsBucket = {
  renderTime: number;
  worldUpdateTime: number;
  aiUpdateTime: number;
};

export interface PerformanceMetrics {
  currentBucket: PerformanceMetricsBucket;
  history: (PerformanceMetricsBucket & { bucketTime: number })[];
}
