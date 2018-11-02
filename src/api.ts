import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { Scheduler } from './Scheduler.js';
import { Monitor } from './Monitor.js';
import { CronJob, JobConfig } from './types.js';

interface ApiRoute {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: (params: Record<string, string>, body: unknown) => Promise<unknown>;
}

export function createApiHandler(scheduler: Scheduler) {
  const monitor = new Monitor(scheduler);

  const routes: ApiRoute[] = [
    // GET /jobs - List all jobs
    {
      method: 'GET',
      pattern: /^\/jobs\/?$/,
      paramNames: [],
      handler: async () => {
        const jobs = scheduler.getAllJobs();
        return jobs.map(serializeJob);
      },
    },

    // POST /jobs - Create a new job
    {
      method: 'POST',
      pattern: /^\/jobs\/?$/,
      paramNames: [],
      handler: async (_params, body) => {
        const data = body as { name: string; expression: string; config?: JobConfig; handler?: string };
        if (!data.name || !data.expression) {
          throw new ApiError(400, 'name and expression are required');
        }

        // In a real app, the handler would be loaded from a registry or module
        const handler = async () => {
          console.log(`[Job] Executing "${data.name}" at ${new Date().toISOString()}`);
          return { executed: true, timestamp: Date.now() };
        };

        const job = scheduler.addJob(data.name, data.expression, handler, data.config);
        return serializeJob(job);
      },
    },

    // PATCH /jobs/:id - Update a job (pause/resume)
    {
      method: 'PATCH',
      pattern: /^\/jobs\/([^/]+)\/?$/,
      paramNames: ['id'],
      handler: async (params, body) => {
        const data = body as { action?: 'pause' | 'resume' };

        if (data.action === 'pause') {
          scheduler.pauseJob(params.id);
        } else if (data.action === 'resume') {
          scheduler.resumeJob(params.id);
        }

        return serializeJob(scheduler.getJob(params.id));
      },
    },

    // DELETE /jobs/:id - Delete a job
    {
      method: 'DELETE',
      pattern: /^\/jobs\/([^/]+)\/?$/,
      paramNames: ['id'],
      handler: async (params) => {
        const removed = scheduler.removeJob(params.id);
        if (!removed) throw new ApiError(404, `Job not found: ${params.id}`);
        return { deleted: true, id: params.id };
      },
    },

    // POST /jobs/:id/run - Run a job immediately
    {
      method: 'POST',
      pattern: /^\/jobs\/([^/]+)\/run\/?$/,
      paramNames: ['id'],
      handler: async (params) => {
        const result = await scheduler.runJob(params.id);
        return result;
      },
    },

    // GET /jobs/:id/history - Get job execution history
    {
      method: 'GET',
      pattern: /^\/jobs\/([^/]+)\/history\/?$/,
      paramNames: ['id'],
      handler: async (params) => {
        const history = scheduler.getHistory();
        return history.getByJobId(params.id, 100);
      },
    },

    // GET /monitor - Get monitoring snapshot
    {
      method: 'GET',
      pattern: /^\/monitor\/?$/,
      paramNames: [],
      handler: async () => {
        const snapshot = monitor.getSnapshot();
        return {
          ...snapshot,
          jobStats: Object.fromEntries(snapshot.jobStats),
        };
      },
    },

    // GET /health - Health check
    {
      method: 'GET',
      pattern: /^\/health\/?$/,
      paramNames: [],
      handler: async () => {
        return monitor.healthCheck();
      },
    },

    // GET /metrics - Prometheus metrics
    {
      method: 'GET',
      pattern: /^\/metrics\/?$/,
      paramNames: [],
      handler: async () => {
        return monitor.exportMetrics();
      },
    },
  ];

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    const path = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    for (const route of routes) {
      if (route.method !== method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      try {
        const body = await parseBody(req);
        const result = await route.handler(params, body);

        // Special case: metrics returns plain text
        if (path === '/metrics' && typeof result === 'string') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(result);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: result }, null, 2));
      } catch (err) {
        const status = err instanceof ApiError ? err.statusCode : 500;
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `Not found: ${method} ${path}` }));
  }

  function startServer(port: number = 4040): ReturnType<typeof createServer> {
    const server = createServer(handleRequest);
    server.listen(port, () => {
      console.log(`CronMaster API running on http://localhost:${port}`);
      console.log('Endpoints:');
      console.log('  GET    /jobs              - List all jobs');
      console.log('  POST   /jobs              - Create a new job');
      console.log('  PATCH  /jobs/:id          - Update a job (pause/resume)');
      console.log('  DELETE /jobs/:id          - Delete a job');
      console.log('  POST   /jobs/:id/run      - Run a job now');
      console.log('  GET    /jobs/:id/history   - Job history');
      console.log('  GET    /monitor           - Monitoring snapshot');
      console.log('  GET    /health            - Health check');
      console.log('  GET    /metrics           - Prometheus metrics');
    });
    return server;
  }

  return { handleRequest, startServer };
}

function serializeJob(job: CronJob): Record<string, unknown> {
  return {
    id: job.id,
    name: job.name,
    expression: job.expression,
    status: job.status,
    lastRun: job.lastRun?.toISOString() ?? null,
    nextRun: job.nextRun?.toISOString() ?? null,
    runCount: job.runCount,
    errorCount: job.errorCount,
    config: {
      timeout: job.config.timeout,
      retries: job.config.retries,
      timezone: job.config.timezone,
      description: job.config.description,
      tags: job.config.tags,
      enabled: job.config.enabled,
    },
    createdAt: job.createdAt.toISOString(),
  };
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve(null);
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
