import { JobResult } from './types.js';

interface ExecuteOptions {
  timeout: number;
  retries: number;
  retryDelay: number;
}

export class Executor {
  /**
   * Execute a job handler with timeout protection, retry logic, and error handling.
   */
  async execute(
    handler: () => Promise<unknown> | unknown,
    options: ExecuteOptions,
    jobId: string,
  ): Promise<JobResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
      const startedAt = new Date();

      try {
        const output = await this.runWithTimeout(handler, options.timeout);
        const completedAt = new Date();

        return {
          jobId,
          success: true,
          output,
          startedAt,
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          retryAttempt: attempt,
        };
      } catch (err) {
        const completedAt = new Date();
        lastError = err instanceof Error ? err.message : String(err);

        // Log retry attempt
        if (attempt < options.retries) {
          console.warn(
            `[CronMaster] Job ${jobId} failed (attempt ${attempt + 1}/${options.retries + 1}): ${lastError}. ` +
            `Retrying in ${options.retryDelay}ms...`,
          );
          await this.delay(options.retryDelay);
        }
      }
    }

    // All attempts failed
    return {
      jobId,
      success: false,
      error: lastError ?? 'Unknown error',
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
      retryAttempt: options.retries,
    };
  }

  /**
   * Run a handler with a timeout. Rejects if the handler takes too long.
   */
  private runWithTimeout(handler: () => Promise<unknown> | unknown, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Job timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      try {
        const result = handler();

        if (result instanceof Promise) {
          result
            .then((value) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(value);
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
              }
            });
        } else {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
