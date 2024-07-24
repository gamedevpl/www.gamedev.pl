import { HistogramEntry } from "./world-state-types";

export function getValueInTime<T>(
  histogram: Array<HistogramEntry<T>>,
  currentTimestamp: number
): T {
  let result = histogram[0];

  for (const entry of histogram) {
    if (
      entry.timestamp < currentTimestamp &&
      entry.timestamp > result.timestamp
    ) {
      result = entry;
    }
  }

  return result;
}
