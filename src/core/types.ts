import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { RequestLogger } from './logger';

export type Region = 'US' | 'EU';
export type LogLevel = 'info' | 'warn' | 'error';
export type AttributeValue = string | number | boolean | undefined;

/** Adds the underlying `logger` (for flush/shutdown) to a middleware or handler. */
export type WithLogger<T> = T & { logger: RequestLogger };

export interface LogEntry {
  timestamp: number;
  message: string;
  attributes: Record<string, unknown>;
}

/** Everything the request logger knows about one finished request. */
export interface RequestInfo {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  method: string;
  url: string;
  route?: string;
  status: number;
  durationMs: number;
  reqLength?: number;
  resLength?: number;
  userAgent?: string;
  ip?: string;
  headers: IncomingHttpHeaders;
  aborted?: boolean;
  error?: Error;
}

/** Minimal sink interface so you can plug in your own transport (or a mock in tests). */
export interface LogSink {
  push(entry: LogEntry): void;
  flush(): Promise<unknown>;
  shutdown(): Promise<void>;
}

export interface Options {
  /** New Relic license / ingest key. Falls back to NEW_RELIC_LICENSE_KEY. */
  apiKey?: string;
  region?: Region;
  /** Override the Log API host (e.g. for a proxy or tests). */
  host?: string;
  serviceName?: string;
  environment?: string;
  /** Extra attributes added to every log. */
  attributes?: Record<string, AttributeValue>;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
  flushOnExit?: boolean;
  /** Strings match as path prefix; RegExps are tested against the path. */
  ignorePaths?: Array<string | RegExp>;
  /** 0..1, applied to non-5xx responses only. */
  sampleRate?: number;
  logHeaders?: boolean;
  /** Extra header / query-param names to redact (case-insensitive). */
  redactKeys?: string[];
  shouldLog?: (info: RequestInfo) => boolean;
  customAttributes?: (req: IncomingMessage, res: ServerResponse) => Record<string, unknown>;
  onError?: (err: Error, batch: LogEntry[]) => void;
  /** Provide your own sink instead of the built-in New Relic client. */
  client?: LogSink;
}