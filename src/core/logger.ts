import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { NewRelicClient } from './client';
import type { LogLevel, LogSink, Options, RequestInfo } from './types';

const DEFAULT_REDACT = [
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'password',
  'token', 'access_token', 'refresh_token', 'secret', 'api_key', 'apikey',
];

export interface TrackHooks {
  getUrl?: () => string;
  getRoute?: () => string | undefined;
  getError?: () => Error | undefined;
}

function sanitizeUrl(url: string, redact: Set<string>): string {
  const i = url.indexOf('?');
  if (i < 0) {return url;}
  const params = new URLSearchParams(url.slice(i + 1));
  for (const k of [...params.keys()]) {
    if (redact.has(k.toLowerCase())) {params.set(k, '[REDACTED]');}
  }
  return `${url.slice(0, i)}?${params.toString()}`;
}

function sanitizeHeaders(headers: IncomingHttpHeaders, redact: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {out[k] = redact.has(k.toLowerCase()) ? '[REDACTED]' : v;}
  return out;
}

const toNum = (v: unknown): number | undefined => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export class RequestLogger {
  readonly client: LogSink;
  private readonly redact: Set<string>;
  private readonly ignore: Array<string | RegExp>;
  private readonly sampleRate: number;
  private readonly logHeaders: boolean;

  constructor(private readonly opts: Options = {}) {
    this.client = opts.client ?? new NewRelicClient(opts);
    this.redact = new Set([...DEFAULT_REDACT, ...(opts.redactKeys ?? [])].map((s) => s.toLowerCase()));
    this.ignore = opts.ignorePaths ?? [];
    this.sampleRate = opts.sampleRate ?? 1;
    this.logHeaders = opts.logHeaders ?? false;
  }

  private isIgnored(path: string): boolean {
    return this.ignore.some((p) => (p instanceof RegExp ? p.test(path) : path.startsWith(p)));
  }

  /** Build + enqueue one log entry. */
  record(info: RequestInfo): void {
    const path = info.url.split('?')[0];
    if (this.isIgnored(path)) {return;}
    if (this.opts.shouldLog && !this.opts.shouldLog(info)) {return;}
    if (info.status < 500 && this.sampleRate < 1 && Math.random() > this.sampleRate) {return;}

    const duration = Math.round(info.durationMs * 100) / 100;
    const level: LogLevel = info.status >= 500 ? 'error' : info.status >= 400 ? 'warn' : 'info';

    const attributes: Record<string, unknown> = {
      'method': info.method,
      'url': sanitizeUrl(info.url, this.redact),
      'path': path,
      'route': info.route,
      'statusCode': info.status,
      'durationMs': duration,
      'requestContentLength': info.reqLength,
      'responseContentLength': info.resLength,
      'userAgent': info.userAgent,
      'clientIp': info.ip,
      'aborted': info.aborted || undefined,
      requestId: info.requestId,
      level,
    };
    if (info.error) {
      attributes['error.message'] = info.error.message ?? String(info.error);
      attributes['error.stack'] = info.error.stack;
    }
    if (this.logHeaders) {
      attributes['headers'] = JSON.stringify(sanitizeHeaders(info.headers, this.redact));
    }
    if (this.opts.customAttributes) {
      try {
        Object.assign(attributes, this.opts.customAttributes(info.req, info.res));
      } catch {
        /* never let user code break logging */
      }
    }

    this.client.push({
      timestamp: Date.now(),
      message: `${info.method} ${path} ${info.status} ${duration}ms`,
      attributes,
    });
  }

  /** Track a Node http (req, res) pair. Used by Express/Connect/Koa/plain http. */
  track(req: IncomingMessage, res: ServerResponse, hooks: TrackHooks = {}): string {
    const start = process.hrtime.bigint();
    const headerId = req.headers['x-request-id'];
    const requestId = (Array.isArray(headerId) ? headerId[0] : headerId) || randomUUID();
    if (!res.headersSent) {res.setHeader('x-request-id', requestId);}
    let done = false;

    const finish = () => {
      if (done) {return;}
      done = true;
      const fwd = req.headers['x-forwarded-for'];
      const fwdIp = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim();
      this.record({
        req,
        res,
        requestId,
        method: req.method ?? 'UNKNOWN',
        url: hooks.getUrl?.() ?? (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/',
        route: hooks.getRoute?.(),
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
        reqLength: toNum(req.headers['content-length']),
        resLength: toNum(res.getHeader('content-length')),
        userAgent: req.headers['user-agent'],
        ip: fwdIp || req.socket?.remoteAddress,
        headers: req.headers,
        aborted: !res.writableFinished,
        error: hooks.getError?.(),
      });
    };
    res.on('finish', finish);
    res.on('close', finish);
    return requestId;
  }

  flush(): Promise<unknown> {
    return this.client.flush();
  }
  shutdown(): Promise<void> {
    return this.client.shutdown();
  }
}