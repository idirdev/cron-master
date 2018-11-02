export type JobStatus = 'active' | 'paused' | 'running' | 'error' | 'completed';

export interface CronJob {
  id: string;
  name: string;
  expression: string;
  handler: () => Promise<unknown> | unknown;
  config: JobConfig;
  status: JobStatus;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  createdAt: Date;
}

export interface JobConfig {
  timezone?: string;
  timeout?: number;           // Max execution time in ms
  retries?: number;           // Retry count on failure
  retryDelay?: number;        // Delay between retries in ms
  maxConcurrent?: number;     // Max concurrent executions
  catchUp?: boolean;          // Run missed jobs on startup
  enabled?: boolean;
  description?: string;
  tags?: string[];
}

export interface JobResult {
  jobId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;           // in ms
  retryAttempt: number;
}

export interface HistoryEntry extends JobResult {
  id: string;
}

export interface CronField {
  type: 'wildcard' | 'value' | 'range' | 'list' | 'step';
  values: number[];
}

export interface ParsedCronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  raw: string;
}

export interface SchedulerOptions {
  maxConcurrent?: number;
  tickInterval?: number;      // Check interval in ms (default: 1000)
  timezone?: string;          // Default timezone
  onJobComplete?: (result: JobResult) => void;
  onJobError?: (error: Error, job: CronJob) => void;
}

export interface MonitorSnapshot {
  totalJobs: number;
  activeJobs: number;
  pausedJobs: number;
  runningJobs: number;
  errorJobs: number;
  upcomingRuns: Array<{ jobId: string; name: string; nextRun: Date }>;
  overdueJobs: Array<{ jobId: string; name: string; expectedRun: Date }>;
  jobStats: Map<string, JobStats>;
}

export interface JobStats {
  totalRuns: number;
  successCount: number;
  errorCount: number;
  successRate: number;        // 0-1
  avgDuration: number;        // ms
  minDuration: number;
  maxDuration: number;
  lastRun?: Date;
}
