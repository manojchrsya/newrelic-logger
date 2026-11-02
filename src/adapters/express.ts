import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestLogger } from '../core/logger';
import type { Options, WithLogger } from '../core/types';

interface ExpressReq extends IncomingMessage {
  originalUrl?: string;
  baseUrl?: string;
  route?: { path: string };
}

/**
 * Express, Connect, and NestJS (Express adapter).
 *
 *   app.use(expressMiddleware({ apiKey, serviceName }));
 */
export function expressMiddleware(
  opts?: Options
): WithLogger<(req: ExpressReq, res: ServerResponse, next: (err?: unknown) => void) => void> {
  const logger = new RequestLogger(opts);
  const mw = (req: ExpressReq, res: ServerResponse, next: (err?: unknown) => void): void => {
    logger.track(req, res, {
      getRoute: () => (req.route ? (req.baseUrl ?? '') + req.route.path : undefined),
    });
    next();
  };
  return Object.assign(mw, { logger });
}