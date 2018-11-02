import { CronJob, JobConfig, JobResult, SchedulerOptions, JobStatus } from './types.js';
import { CronParser } from './Parser.js';
import { Executor } from './Executor.js';
import { JobHistory } from './History.js';

export class Scheduler {
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private runningJobs: Set<string> = new Set();
  private parser: CronParser;
  private executor: Executor;
  private history: JobHistory;
  private options: Required<SchedulerOptions>;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private jobIdCounter: number = 0;

  constructor(options: SchedulerOptions = {}) {
    this.parser = new CronParser();
    this.executor = new Executor();
    this.history = new JobHistory();
    this.options = {
      maxConcurrent: options.maxConcurrent ?? 10,
      tickInterval: options.tickInterval ?? 1000,
      timezone: options.timezone ?? 'UTC',
      onJobComplete: options.onJobComplete ?? (() => {}),
      onJobError: options.onJobError ?? (() => {}),
    };
  }

  addJob(
    name: string,
    expression: string,
    handler: () => Promise<unknown> | unknown,
    config: JobConfig = {},
  ): CronJob {
    // Validate expression first
    const validationError = this.parser.validate(expression);
    if (validationError) throw new Error(`Invalid cron expression: ${validationError}`);

    const id = `job_${++this.jobIdCounter}_${Date.now()}`;
    const parsed = this.parser.parse(expression);
    const nextRun = this.parser.getNextRun(parsed);

    const job: CronJob = {
      id,
      name,
      expression,
      handler,
      config: {
        timeout: 30000,
        retries: 0,
        retryDelay: 1000,
        maxConcurrent: 1,
        catchUp: false,
        enabled: true,
        ...config,
      },
      status: config.enabled === false ? 'paused' : 'active',
      nextRun,
      runCount: 0,
      errorCount: 0,
      createdAt: new Date(),
    };

    this.jobs.set(id, job);
    if (job.status === 'active') this.scheduleNext(job);

    return job;
  }

  removeJob(jobId: string): boolean {
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);
    this.timers.delete(jobId);
    return this.jobs.delete(jobId);
  }

  pauseJob(jobId: string): void {
    const job = this.getJob(jobId);
    if (job.status === 'running') throw new Error('Cannot pause a running job');
    job.status = 'paused';
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);
    this.timers.delete(jobId);
  }

  resumeJob(jobId: string): void {
    const job = this.getJob(jobId);
    if (job.status !== 'paused') throw new Error('Job is not paused');
    job.status = 'active';
    const parsed = this.parser.parse(job.expression);
    job.nextRun = this.parser.getNextRun(parsed);
    this.scheduleNext(job);
  }

  async runJob(jobId: string): Promise<JobResult> {
    const job = this.getJob(jobId);
    return this.executeJob(job);
  }

  private scheduleNext(job: CronJob): void {
    if (job.status !== 'active') return;

    const parsed = this.parser.parse(job.expression);
    const nextRun = this.parser.getNextRun(parsed);
    job.nextRun = nextRun;

    const delay = Math.max(nextRun.getTime() - Date.now(), 0);

    const timer = setTimeout(async () => {
      this.timers.delete(job.id);
      await this.executeJob(job);
      if (job.status === 'active') this.scheduleNext(job);
    }, delay);

    this.timers.set(job.id, timer);
  }

  private async executeJob(job: CronJob): Promise<JobResult> {
    // Check concurrent limit
    if (this.runningJobs.size >= this.options.maxConcurrent) {
      const result: JobResult = {
        jobId: job.id,
        success: false,
        error: 'Max concurrent jobs reached',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
        retryAttempt: 0,
      };
      this.history.record(result);
      return result;
    }

    const prevStatus = job.status;
    job.status = 'running';
    this.runningJobs.add(job.id);

    const result = await this.executor.execute(
      job.handler,
      {
        timeout: job.config.timeout ?? 30000,
        retries: job.config.retries ?? 0,
        retryDelay: job.config.retryDelay ?? 1000,
      },
      job.id,
    );

    this.runningJobs.delete(job.id);
    job.lastRun = result.completedAt;
    job.runCount++;

    if (result.success) {
      job.status = 'active';
      this.options.onJobComplete(result);
    } else {
      job.errorCount++;
      job.status = job.errorCount > (job.config.retries ?? 0) * 3 ? 'error' : 'active';
      this.options.onJobError(new Error(result.error ?? 'Unknown error'), job);
    }

    this.history.record(result);
    return result;
  }

  start(): void {
    for (const job of this.jobs.values()) {
      if (job.status === 'active' && !this.timers.has(job.id)) {
        if (job.config.catchUp && job.nextRun && job.nextRun.getTime() < Date.now()) {
          this.executeJob(job).then(() => this.scheduleNext(job));
        } else {
          this.scheduleNext(job);
        }
      }
    }
  }

  stop(): void {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  getJob(jobId: string): CronJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job;
  }

  getAllJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  getJobsByStatus(status: JobStatus): CronJob[] {
    return this.getAllJobs().filter((j) => j.status === status);
  }

  getJobsByTag(tag: string): CronJob[] {
    return this.getAllJobs().filter((j) => j.config.tags?.includes(tag));
  }

  getHistory(): JobHistory { return this.history; }
  getRunningCount(): number { return this.runningJobs.size; }
}
