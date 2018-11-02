# cron-master

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Cron job scheduler and manager** with expression parsing, retry logic, execution history, monitoring, and a built-in REST API. Minimal dependencies -- just TypeScript and Commander.

## Features

- **Cron expression parser** - Full support for `* * * * *` syntax, ranges, lists, steps, names, special strings
- **Job scheduler** - Add, remove, pause, resume jobs with automatic next-run calculation
- **Executor** - Timeout protection, configurable retries, error capture
- **Execution history** - Record every run with duration, status, output, stats
- **Monitoring** - Dashboard snapshot, health check, overdue detection, Prometheus metrics
- **REST API** - Full CRUD + run-now + history endpoints with CORS

## Quick Start

```bash
npm install cron-master
```

### Basic Usage

```typescript
import { Scheduler, Monitor } from 'cron-master';

const scheduler = new Scheduler({
  maxConcurrent: 5,
  onJobComplete: (result) => console.log(`Job ${result.jobId} completed in ${result.duration}ms`),
  onJobError: (err, job) => console.error(`Job ${job.name} failed: ${err.message}`),
});

// Add jobs with cron expressions
scheduler.addJob('cleanup', '0 */6 * * *', async () => {
  console.log('Running cleanup...');
  return { cleaned: 42 };
}, {
  timeout: 60000,
  retries: 2,
  retryDelay: 5000,
  description: 'Clean up old records every 6 hours',
  tags: ['maintenance'],
});

scheduler.addJob('daily-report', '0 9 * * MON-FRI', async () => {
  console.log('Generating daily report...');
  return { generated: true };
}, {
  timezone: 'America/New_York',
  description: 'Generate report on weekday mornings',
});

// Start the scheduler
scheduler.start();

// Monitor health
const monitor = new Monitor(scheduler);
const health = monitor.healthCheck();
console.log('Healthy:', health.healthy);
```

### Start the REST API

```typescript
import { Scheduler, createApiHandler } from 'cron-master';

const scheduler = new Scheduler();
scheduler.addJob('heartbeat', '* * * * *', () => ({ alive: true }));

const api = createApiHandler(scheduler);
api.startServer(4040);
```

## Cron Expression Reference

```
 ┌───────────── minute (0-59)
 │ ┌───────────── hour (0-23)
 │ │ ┌───────────── day of month (1-31)
 │ │ │ ┌───────────── month (1-12 or JAN-DEC)
 │ │ │ │ ┌───────────── day of week (0-6 or SUN-SAT)
 │ │ │ │ │
 * * * * *
```

### Supported Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| `*` | `* * * * *` | Every minute |
| Value | `30 * * * *` | At minute 30 |
| Range | `1-5 * * * *` | Minutes 1 through 5 |
| List | `0,15,30 * * * *` | At minutes 0, 15, and 30 |
| Step | `*/5 * * * *` | Every 5 minutes |
| Names | `0 9 * * MON-FRI` | 9 AM on weekdays |

### Special Strings

| String | Equivalent | Description |
|--------|-----------|-------------|
| `@yearly` | `0 0 1 1 *` | Once a year |
| `@monthly` | `0 0 1 * *` | Once a month |
| `@weekly` | `0 0 * * 0` | Once a week (Sunday) |
| `@daily` | `0 0 * * *` | Once a day (midnight) |
| `@hourly` | `0 * * * *` | Once an hour |

## REST API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/jobs` | List all jobs |
| `POST` | `/jobs` | Create a new job |
| `PATCH` | `/jobs/:id` | Pause or resume a job |
| `DELETE` | `/jobs/:id` | Delete a job |
| `POST` | `/jobs/:id/run` | Trigger immediate execution |
| `GET` | `/jobs/:id/history` | Get execution history |
| `GET` | `/monitor` | Full monitoring snapshot |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus-format metrics |

### Examples

```bash
# List all jobs
curl http://localhost:4040/jobs

# Create a job
curl -X POST http://localhost:4040/jobs \
  -H "Content-Type: application/json" \
  -d '{"name": "test", "expression": "*/5 * * * *"}'

# Pause a job
curl -X PATCH http://localhost:4040/jobs/job_1_... \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'

# Run a job now
curl -X POST http://localhost:4040/jobs/job_1_.../run

# Check health
curl http://localhost:4040/health
```

## API Reference

### `CronParser`
- `parse(expression)` - Parse a cron expression
- `getNextRun(parsed, from?)` - Calculate next run time
- `validate(expression)` - Validate, returns null or error message
- `describe(expression)` - Human-readable description

### `Scheduler`
- `addJob(name, expression, handler, config?)` - Register a job
- `removeJob(id)` - Remove a job
- `pauseJob(id)` / `resumeJob(id)` - Pause/resume
- `runJob(id)` - Trigger immediate execution
- `start()` / `stop()` - Start/stop the scheduler
- `getAllJobs()` - List all jobs
- `getJobsByStatus(status)` / `getJobsByTag(tag)` - Filter jobs

### `Executor`
- `execute(handler, options, jobId)` - Run with timeout and retry

### `JobHistory`
- `record(result)` - Record an execution
- `getByJobId(id, limit?)` - Get job history
- `getStats(jobId)` - Get job statistics (success rate, avg duration)
- `cleanup(olderThan)` - Remove old records

### `Monitor`
- `getSnapshot()` - Full scheduler status
- `healthCheck(threshold?)` - Health check with issues
- `exportMetrics()` - Prometheus text format
- `getUpcomingSchedule(jobId, count?)` - Next N run times

## License

MIT
