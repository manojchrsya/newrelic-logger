import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestLogger } from '../core/logger.js';
import type { Options } from '../core/types.js';

// Structural types so `fastify` is not a hard dependency.
interface FastifyLikeRequest {
  id: string;
  method: string;
  url: string;
  ip: string;
  headers: IncomingMessage['headers'];
  raw: IncomingMessage;
  routerPath?: string;
  routeOptions?: { url?: string };
  _nrStart?: bigint;
  _nrError?: Error;
}
interface FastifyLikeReply {
  statusCode: number;
  raw: ServerResponse;
  getHeader(name: string): unknown;
}
interface FastifyLike {
  decorate(name: string, value: unknown): void;
  addHook(name: string, fn: (...args: any[]) => void): void;
}

/**
 * Fastify and NestJS (Fastify adapter).
 *
 *   app.register(fastifyPlugin, { apiKey, serviceName });
 */
export function fastifyPlugin(fastify: FastifyLike, opts: Options, done: (err?: Error) => void): void {
  const logger = new RequestLogger(opts);
  fastify.decorate('nrLogger', logger);

  fastify.addHook('onRequest', (req: FastifyLikeRequest, _reply: FastifyLikeReply, next: () => void) => {
    req._nrStart = process.hrtime.bigint();
    next();
  });
  fastify.addHook('onError', (req: FastifyLikeRequest, _reply: FastifyLikeReply, error: Error, next: () => void) => {
    req._nrError = error;
    next();
  });
  fastify.addHook('onResponse', (req: FastifyLikeRequest, reply: FastifyLikeReply, next: () => void) => {
    const len = Number(reply.getHeader('content-length'));
    const reqLen = Number(req.headers['content-length']);
    logger.record({
      req: req.raw,
      res: reply.raw,
      requestId: req.id,
      method: req.method,
      url: req.url,
      route: req.routeOptions?.url ?? req.routerPath,
      status: reply.statusCode,
      durationMs: Number(process.hrtime.bigint() - (req._nrStart ?? process.hrtime.bigint())) / 1e6,
      reqLength: reqLen > 0 ? reqLen : undefined,
      resLength: len > 0 ? len : undefined,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      headers: req.headers,
      error: req._nrError,
    });
    next();
  });
  fastify.addHook('onClose', (_instance: unknown, next: () => void) => {
    logger.shutdown().then(next, next);
  });
  done();
}

// Same effect as `fastify-plugin`: expose hooks app-wide rather than encapsulated.
(fastifyPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;