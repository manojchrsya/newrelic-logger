import * as https from 'node:https';
import * as zlib from 'node:zlib';
import * as os from 'node:os';
import type { LogEntry, LogSink, Options } from './types.js';

const HOSTS = { US: 'log-api.newrelic.com', EU: 'log-api.eu.newrelic.com' } as const;
const MAX_COMPRESSED_BYTES = 1_000_000; // New Relic Log API limit per payload

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`New Relic Log API responded ${status}`);
  }
  get retryable(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

export class NewRelicClient implements LogSink {
  private readonly apiKey: string;
  private readonly host: string;
  private readonly path = '/log/v1';
  private readonly batchSize: number;
  private readonly maxQueueSize: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly onError: (err: Error, batch: LogEntry[]) => void;
  private readonly common: Record<string, unknown>;
  private readonly timer: NodeJS.Timeout;
  private queue: LogEntry[] = [];
  private pending = new Set<Promise<void>>();
  public dropped = 0;

  constructor(opts: Options = {}) {
    const apiKey = opts.apiKey || process.env.NEW_RELIC_LICENSE_KEY || process.env.NEW_RELIC_API_KEY;
    if (!apiKey) {
      throw new Error('newrelic-logger: apiKey is required (or set NEW_RELIC_LICENSE_KEY)');
    }
    this.apiKey = apiKey;
    this.host = opts.host ?? HOSTS[opts.region ?? 'US'] ?? HOSTS.US;
    this.batchSize = opts.batchSize ?? 1;
    this.maxQueueSize = opts.maxQueueSize ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.onError = opts.onError ?? (() => undefined);

    this.common = {
      'service.name': opts.serviceName ?? process.env.NEW_RELIC_APP_NAME ?? 'node-service',
      hostname: os.hostname(),
      environment: opts.environment ?? process.env.NODE_ENV ?? 'development',
      ...opts.attributes,
    };

    this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 5000);
    this.timer.unref();

    if (opts.flushOnExit !== false) {
      process.once('beforeExit', () => void this.flush());
    }
  }

  push(entry: LogEntry): void {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push(entry);
    if (this.queue.length >= this.batchSize) {void this.flush();}
  }

  flush(): Promise<void[]> {
    const jobs: Promise<void>[] = [];
    while (this.queue.length) {
      const batch = this.queue.splice(0, this.batchSize);
      const p: Promise<void> = this.send(batch)
        .catch((err: Error) => this.onError(err, batch))
        .finally(() => {
          this.pending.delete(p);
        });
      this.pending.add(p);
      jobs.push(p);
    }
    return Promise.all(jobs);
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
    await Promise.all(this.pending);
  }

  private async send(batch: LogEntry[]): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const payload = JSON.stringify([{ common: { attributes: this.common }, logs: batch }]);
    const body = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(payload, (err, compressed) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(compressed);
      });
    });

    if (body.length > MAX_COMPRESSED_BYTES && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      await this.send(batch.slice(0, mid));
      return this.send(batch.slice(mid));
    }

    let lastErr: Error = new Error('unknown error');
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const status = await this.post(body);
        if (status >= 200 && status < 300) {return;}
        const err = new HttpError(status);
        if (!err.retryable) {throw err;}
        lastErr = err;
      } catch (err) {
        if (err instanceof HttpError && !err.retryable) {throw err;}
        lastErr = err as Error;
      }
      if (attempt < this.maxRetries) {await sleep(Math.min(1000 * 2 ** attempt, 15_000));}
    }
    throw lastErr;
  }

  private post(body: Buffer): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: this.host,
          path: this.path,
          method: 'POST',
          timeout: this.timeoutMs,
          headers: {
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
            'Content-Length': body.length,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        }
      );
      req.on('timeout', () => req.destroy(new Error('New Relic request timed out')));
      req.on('error', reject);
      req.end(body);
    });
  }
}