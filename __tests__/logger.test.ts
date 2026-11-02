import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { RequestLogger } from '../src/core/logger.js';
import type { LogEntry, LogSink, RequestInfo } from '../src/core/types.js';

function createRequestInfo(overrides: Partial<RequestInfo> = {}): RequestInfo {
  return {
    req: {} as IncomingMessage,
    res: {} as ServerResponse,
    requestId: 'request-123',
    method: 'GET',
    url: '/users?token=private-value&view=full',
    status: 200,
    durationMs: 12.345,
    headers: {
      authorization: 'Bearer private-value',
      'user-agent': 'vitest',
    },
    ...overrides,
  };
}

function createSink() {
  const entries: LogEntry[] = [];
  const sink: LogSink = {
    push: vi.fn<(entry: LogEntry) => void>((entry) => {
      entries.push(entry);
    }),
    flush: vi.fn<() => Promise<void>>(async () => undefined),
    shutdown: vi.fn<() => Promise<void>>(async () => undefined),
  };
  return { entries, sink };
}

describe('RequestLogger', () => {
  it('creates a request log entry and redacts sensitive values', () => {
    const { entries, sink } = createSink();
    const logger = new RequestLogger({ client: sink, logHeaders: true });

    logger.record(createRequestInfo());

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      message: 'GET /users 200 12.35ms',
      attributes: {
        method: 'GET',
        path: '/users',
        statusCode: 200,
        durationMs: 12.35,
        requestId: 'request-123',
        level: 'info',
        url: '/users?token=%5BREDACTED%5D&view=full',
        headers: JSON.stringify({
          authorization: '[REDACTED]',
          'user-agent': 'vitest',
        }),
      },
    });
    expect(entries[0].attributes.url).not.toContain('private-value');
  });

  it('skips ignored paths and applies status-based log levels', () => {
    const { entries, sink } = createSink();
    const logger = new RequestLogger({
      client: sink,
      ignorePaths: ['/health'],
    });

    logger.record(createRequestInfo({ url: '/health/ready' }));
    logger.record(createRequestInfo({ status: 404 }));
    logger.record(createRequestInfo({ status: 500 }));

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.attributes.level)).toEqual(['warn', 'error']);
  });

  it('does not sample out server errors when sampleRate is zero', () => {
    const { entries, sink } = createSink();
    const logger = new RequestLogger({ client: sink, sampleRate: 0 });

    logger.record(createRequestInfo({ status: 200 }));
    logger.record(createRequestInfo({ status: 503 }));

    expect(entries).toHaveLength(1);
    expect(entries[0].attributes.statusCode).toBe(503);
    expect(entries[0].attributes.level).toBe('error');
  });
});
