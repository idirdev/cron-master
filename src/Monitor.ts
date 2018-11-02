import { Scheduler } from './Scheduler.js';
import { MonitorSnapshot, JobStats, CronJob } from './types.js';

export class Monitor {
  private scheduler: Scheduler;

  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }

  /**
   * Get a full snapshot of the scheduler state: counts, upcoming runs,
   * overdue jobs, and per-job statistics.
   */
  getSnapshot(): MonitorSnapshot {
    const jobs = this.scheduler.getAllJobs();
    const history = this.scheduler.getHistory();

    const activeJobs = jobs.filter((j) => j.status === 'active').length;
    const pausedJobs = jobs.filter((j) => j.status === 'paused').length;
    const runningJobs = jobs.filter((j) => j.status === 'running').length;
    const errorJobs = jobs.filter((j) => j.status === 'error').length;

    const now = new Date();

    const upcomingRuns = jobs
      .filter((j) => j.status === 'active' && j.nextRun)
      .sort((a, b) => (a.nextRun!.getTime() - b.nextRun!.getTime()))
      .slice(0, 20)
      .map((j) => ({ jobId: j.id, name: j.name, nextRun: j.nextRun! }));

    const overdueJobs = jobs
      .filter((j) => j.status === 'active' && j.nextRun && j.nextRun.getTime() < now.getTime())
      .map((j) => ({ jobId: j.id, name: j.name, expectedRun: j.nextRun! }));

    return {
      totalJobs: jobs.length,
      activeJobs,
      pausedJobs,
      runningJobs,
      errorJobs,
      upcomingRuns,
      overdueJobs,
      jobStats: history.getAllStats(),
    };
  }

  /**
   * Get the upcoming schedule for a specific job: the next N run times.
   */
  getUpcomingSchedule(jobId: string, count: number = 10): Date[] {
    const job = this.scheduler.getJob(jobId);
    const { CronParser } = require('./Parser.js') as { CronParser: new () => import('./Parser.js').CronParser };
    const parser = new CronParser();
    const parsed = parser.parse(job.expression);

    const dates: Date[] = [];
    let from = new Date();
    for (let i = 0; i < count; i++) {
      const next = parser.getNextRun(parsed, from);
      dates.push(next);
      from = new Date(next.getTime() + 60000); // Move past this minute
    }
    return dates;
  }

  /**
   * Health check: returns true if no jobs are in error state and
   * no jobs are overdue by more than the threshold.
   */
  healthCheck(overdueThresholdMs: number = 300000): { healthy: boolean; issues: string[] } {
    const snapshot = this.getSnapshot();
    const issues: string[] = [];

    if (snapshot.errorJobs > 0) {
      issues.push(`${snapshot.errorJobs} job(s) in error state`);
    }

    const now = Date.now();
    for (const overdue of snapshot.overdueJobs) {
      const overdueBy = now - overdue.expectedRun.getTime();
      if (overdueBy > overdueThresholdMs) {
        issues.push(`Job "${overdue.name}" is overdue by ${Math.round(overdueBy / 1000)}s`);
      }
    }

    return { healthy: issues.length === 0, issues };
  }

  /**
   * Export metrics in a Prometheus-compatible text format.
   */
  exportMetrics(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [];

    lines.push(`# HELP cron_master_jobs_total Total number of registered jobs`);
    lines.push(`# TYPE cron_master_jobs_total gauge`);
    lines.push(`cron_master_jobs_total ${snapshot.totalJobs}`);

    lines.push(`# HELP cron_master_jobs_active Number of active jobs`);
    lines.push(`# TYPE cron_master_jobs_active gauge`);
    lines.push(`cron_master_jobs_active ${snapshot.activeJobs}`);

    lines.push(`# HELP cron_master_jobs_running Number of currently running jobs`);
    lines.push(`# TYPE cron_master_jobs_running gauge`);
    lines.push(`cron_master_jobs_running ${snapshot.runningJobs}`);

    lines.push(`# HELP cron_master_jobs_error Number of jobs in error state`);
    lines.push(`# TYPE cron_master_jobs_error gauge`);
    lines.push(`cron_master_jobs_error ${snapshot.errorJobs}`);

    for (const [jobId, stats] of snapshot.jobStats) {
      lines.push(`cron_master_job_runs_total{job_id="${jobId}"} ${stats.totalRuns}`);
      lines.push(`cron_master_job_success_rate{job_id="${jobId}"} ${stats.successRate.toFixed(4)}`);
      lines.push(`cron_master_job_avg_duration_ms{job_id="${jobId}"} ${stats.avgDuration.toFixed(2)}`);
    }

    return lines.join('\n');
  }
}
