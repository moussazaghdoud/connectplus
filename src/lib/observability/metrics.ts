/**
 * Simple in-process metrics counters.
 * Replace with Prometheus/StatsD client when needed.
 */

interface MetricData {
  count: number;
  lastUpdated: number;
}

class Metrics {
  private counters = new Map<string, MetricData>();

  /** Increment a counter */
  increment(name: string, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const existing = this.counters.get(key);
    this.counters.set(key, {
      count: (existing?.count ?? 0) + 1,
      lastUpdated: Date.now(),
    });
  }

  /** Get a counter value */
  get(name: string, labels?: Record<string, string>): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key)?.count ?? 0;
  }

  /** Get all metrics as a snapshot */
  snapshot(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, data] of this.counters) {
      result[key] = data.count;
    }
    return result;
  }

  /** Reset all counters */
  reset(): void {
    this.counters.clear();
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const suffix = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${suffix}}`;
  }
}

export const metrics = new Metrics();
