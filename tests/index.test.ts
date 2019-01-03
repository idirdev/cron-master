import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CronParser } from '../src/Parser';
import { Scheduler } from '../src/Scheduler';

describe('CronParser - parse', () => {
  const parser = new CronParser();

  it('parses a simple every-minute expression', () => {
    const parsed = parser.parse('* * * * *');
    expect(parsed.minute.type).toBe('wildcard');
    expect(parsed.hour.type).toBe('wildcard');
    expect(parsed.dayOfMonth.type).toBe('wildcard');
    expect(parsed.month.type).toBe('wildcard');
    expect(parsed.dayOfWeek.type).toBe('wildcard');
    expect(parsed.raw).toBe('* * * * *');
  });

  it('parses specific values', () => {
    const parsed = parser.parse('30 14 1 6 3');
    expect(parsed.minute.values).toEqual([30]);
    expect(parsed.hour.values).toEqual([14]);
    expect(parsed.dayOfMonth.values).toEqual([1]);
    expect(parsed.month.values).toEqual([6]);
    expect(parsed.dayOfWeek.values).toEqual([3]);
  });

  it('parses ranges', () => {
    const parsed = parser.parse('0-5 * * * *');
    expect(parsed.minute.type).toBe('range');
    expect(parsed.minute.values).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('parses lists', () => {
    const parsed = parser.parse('0,15,30,45 * * * *');
    expect(parsed.minute.type).toBe('list');
    expect(parsed.minute.values).toEqual([0, 15, 30, 45]);
  });

  it('parses step values', () => {
    const parsed = parser.parse('*/15 * * * *');
    expect(parsed.minute.type).toBe('step');
    expect(parsed.minute.values).toEqual([0, 15, 30, 45]);
  });

  it('parses step with range', () => {
    const parsed = parser.parse('1-10/3 * * * *');
    expect(parsed.minute.type).toBe('step');
    expect(parsed.minute.values).toEqual([1, 4, 7, 10]);
  });

  it('parses @hourly', () => {
    const parsed = parser.parse('@hourly');
    expect(parsed.minute.values).toEqual([0]);
    expect(parsed.hour.type).toBe('wildcard');
  });

  it('parses @daily', () => {
    const parsed = parser.parse('@daily');
    expect(parsed.minute.values).toEqual([0]);
    expect(parsed.hour.values).toEqual([0]);
    expect(parsed.dayOfMonth.type).toBe('wildcard');
  });

  it('parses @weekly', () => {
    const parsed = parser.parse('@weekly');
    expect(parsed.dayOfWeek.values).toEqual([0]);
  });

  it('parses @monthly', () => {
    const parsed = parser.parse('@monthly');
    expect(parsed.dayOfMonth.values).toEqual([1]);
    expect(parsed.month.type).toBe('wildcard');
  });

  it('parses @yearly', () => {
    const parsed = parser.parse('@yearly');
    expect(parsed.month.values).toEqual([1]);
    expect(parsed.dayOfMonth.values).toEqual([1]);
  });

  it('parses month names', () => {
    const parsed = parser.parse('0 0 1 JAN *');
    expect(parsed.month.values).toEqual([1]);
  });

  it('parses day names', () => {
    const parsed = parser.parse('0 0 * * MON');
    expect(parsed.dayOfWeek.values).toEqual([1]);
  });

  it('throws on invalid expression with wrong field count', () => {
    expect(() => parser.parse('* * *')).toThrow('expected 5 fields');
  });

  it('throws on invalid values out of range', () => {
    expect(() => parser.parse('60 * * * *')).toThrow();
  });

  it('throws on unknown special expression', () => {
    expect(() => parser.parse('@bogus')).toThrow('Unknown special expression');
  });
});

describe('CronParser - validate', () => {
  const parser = new CronParser();

  it('returns null for valid expressions', () => {
    expect(parser.validate('*/5 * * * *')).toBeNull();
    expect(parser.validate('@hourly')).toBeNull();
  });

  it('returns error message for invalid expressions', () => {
    const error = parser.validate('not valid');
    expect(error).not.toBeNull();
    expect(typeof error).toBe('string');
  });
});

describe('CronParser - describe', () => {
  const parser = new CronParser();

  it('describes every-minute expression', () => {
    const desc = parser.describe('* * * * *');
    expect(desc).toContain('every minute');
  });

  it('describes a specific time', () => {
    const desc = parser.describe('30 14 * * *');
    expect(desc).toContain('minute 30');
    expect(desc).toContain('hour');
    expect(desc).toContain('14');
  });

  it('describes day of week', () => {
    const desc = parser.describe('0 0 * * 1');
    expect(desc).toContain('Mon');
  });
});

describe('CronParser - getNextRun', () => {
  const parser = new CronParser();

  it('returns a date in the future', () => {
    const parsed = parser.parse('* * * * *');
    const now = new Date();
    const nextRun = parser.getNextRun(parsed, now);
    expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
  });

  it('returns the correct next minute for every-minute cron', () => {
    const parsed = parser.parse('* * * * *');
    const from = new Date('2024-01-15T10:30:00.000Z');
    const nextRun = parser.getNextRun(parsed, from);
    expect(nextRun.getMinutes()).toBe(31);
  });

  it('returns the correct next hour for hourly cron', () => {
    const parsed = parser.parse('0 * * * *');
    const from = new Date('2024-01-15T10:30:00.000Z');
    const nextRun = parser.getNextRun(parsed, from);
    expect(nextRun.getMinutes()).toBe(0);
    expect(nextRun.getHours()).toBe(11);
  });
});

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({ maxConcurrent: 5 });
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('addJob creates a job with correct properties', () => {
    const job = scheduler.addJob('test-job', '*/5 * * * *', () => 'done');
    expect(job.id).toBeTruthy();
    expect(job.name).toBe('test-job');
    expect(job.expression).toBe('*/5 * * * *');
    expect(job.status).toBe('active');
    expect(job.runCount).toBe(0);
    expect(job.errorCount).toBe(0);
    expect(job.nextRun).toBeDefined();
  });

  it('addJob throws for invalid cron expression', () => {
    expect(() => {
      scheduler.addJob('bad', 'invalid expression', () => {});
    }).toThrow('Invalid cron expression');
  });

  it('getJob retrieves a job by ID', () => {
    const created = scheduler.addJob('findme', '0 * * * *', () => {});
    const found = scheduler.getJob(created.id);
    expect(found.name).toBe('findme');
  });

  it('getJob throws for unknown ID', () => {
    expect(() => scheduler.getJob('nonexistent')).toThrow('Job not found');
  });

  it('removeJob removes the job and returns true', () => {
    const job = scheduler.addJob('removable', '0 * * * *', () => {});
    expect(scheduler.removeJob(job.id)).toBe(true);
    expect(() => scheduler.getJob(job.id)).toThrow('Job not found');
  });

  it('removeJob returns false for unknown job', () => {
    expect(scheduler.removeJob('fake-id')).toBe(false);
  });

  it('getAllJobs returns all registered jobs', () => {
    scheduler.addJob('j1', '0 * * * *', () => {});
    scheduler.addJob('j2', '*/10 * * * *', () => {});
    scheduler.addJob('j3', '30 8 * * *', () => {});
    expect(scheduler.getAllJobs()).toHaveLength(3);
  });

  it('pauseJob changes status to paused', () => {
    const job = scheduler.addJob('pausable', '0 * * * *', () => {});
    scheduler.pauseJob(job.id);
    expect(scheduler.getJob(job.id).status).toBe('paused');
  });

  it('resumeJob changes status back to active', () => {
    const job = scheduler.addJob('resumable', '0 * * * *', () => {});
    scheduler.pauseJob(job.id);
    scheduler.resumeJob(job.id);
    expect(scheduler.getJob(job.id).status).toBe('active');
  });

  it('resumeJob throws if job is not paused', () => {
    const job = scheduler.addJob('active-job', '0 * * * *', () => {});
    expect(() => scheduler.resumeJob(job.id)).toThrow('Job is not paused');
  });

  it('addJob with enabled: false starts in paused state', () => {
    const job = scheduler.addJob('disabled', '0 * * * *', () => {}, {
      enabled: false,
    });
    expect(job.status).toBe('paused');
  });

  it('runJob executes the handler immediately', async () => {
    let executed = false;
    const job = scheduler.addJob('immediate', '0 0 1 1 *', () => {
      executed = true;
      return 'result';
    });

    const result = await scheduler.runJob(job.id);
    expect(executed).toBe(true);
    expect(result.success).toBe(true);
    expect(result.jobId).toBe(job.id);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('runJob captures errors', async () => {
    const job = scheduler.addJob('failing', '0 0 1 1 *', () => {
      throw new Error('test failure');
    });

    const result = await scheduler.runJob(job.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain('test failure');
  });

  it('getJobsByStatus filters correctly', () => {
    scheduler.addJob('a1', '0 * * * *', () => {});
    const j2 = scheduler.addJob('a2', '0 * * * *', () => {});
    scheduler.pauseJob(j2.id);

    const active = scheduler.getJobsByStatus('active');
    const paused = scheduler.getJobsByStatus('paused');
    expect(active).toHaveLength(1);
    expect(paused).toHaveLength(1);
  });
});
