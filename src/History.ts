import { JobResult, HistoryEntry, JobStats } from './types.js';

export class JobHistory {
  private entries: HistoryEntry[] = [];
  private maxEntries: number;
  private entryIdCounter: number = 0;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  record(result: JobResult): HistoryEntry {
    const entry: HistoryEntry = {
      ...result,
      id: `hist_${++this.entryIdCounter}_${Date.now()}`,
    };

    this.entries.push(entry);

    // Enforce max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }

    return entry;
  }

  getByJobId(jobId: string, limit?: number): HistoryEntry[] {
    const filtered = this.entries.filter((e) => e.jobId === jobId);
    if (limit) return filtered.slice(-limit);
    return filtered;
  }

  getRecent(limit: number = 50): HistoryEntry[] {
    return this.entries.slice(-limit);
  }

  getByDateRange(start: Date, end: Date): HistoryEntry[] {
    return this.entries.filter((e) =>
      e.startedAt.getTime() >= start.getTime() && e.startedAt.getTime() <= end.getTime(),
    );
  }

  getFailures(limit?: number): HistoryEntry[] {
    const failures = this.entries.filter((e) => !e.success);
    if (limit) return failures.slice(-limit);
    return failures;
  }

  getStats(jobId: string): JobStats {
    const jobEntries = this.entries.filter((e) => e.jobId === jobId);

    if (jobEntries.length === 0) {
      return {
        totalRuns: 0,
        successCount: 0,
        errorCount: 0,
        successRate: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const successEntries = jobEntries.filter((e) => e.success);
    const durations = jobEntries.map((e) => e.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    return {
      totalRuns: jobEntries.length,
      successCount: successEntries.length,
      errorCount: jobEntries.length - successEntries.length,
      successRate: successEntries.length / jobEntries.length,
      avgDuration: totalDuration / jobEntries.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      lastRun: jobEntries[jobEntries.length - 1]?.completedAt,
    };
  }

  getAllStats(): Map<string, JobStats> {
    const jobIds = new Set(this.entries.map((e) => e.jobId));
    const stats = new Map<string, JobStats>();
    for (const jobId of jobIds) {
      stats.set(jobId, this.getStats(jobId));
    }
    return stats;
  }

  clear(jobId?: string): void {
    if (jobId) {
      this.entries = this.entries.filter((e) => e.jobId !== jobId);
    } else {
      this.entries = [];
    }
  }

  cleanup(olderThan: Date): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.completedAt.getTime() >= olderThan.getTime());
    return before - this.entries.length;
  }

  count(jobId?: string): number {
    if (jobId) return this.entries.filter((e) => e.jobId === jobId).length;
    return this.entries.length;
  }

  toJSON(): HistoryEntry[] {
    return [...this.entries];
  }
}
