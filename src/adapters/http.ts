import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestLogger } from '../core/logger.js';
import type { Options, WithLogger } from '../core/types.js';

/**
 * Plain Node `http` / `https` servers.
 *
 *   http.createServer(withRequestLogging({ apiKey }, (req, res) => res.end('ok')));
 */
export function withRequestLogging<H extends (req: IncomingMessage, res: ServerResponse) => unknown>(
  opts: Options,
  handler: H
): WithLogger<(req: IncomingMessage, res: ServerResponse) => ReturnType<H>> {
  const logger = new RequestLogger(opts);
  const wrapped = (req: IncomingMessage, res: ServerResponse): ReturnType<H> => {
    logger.track(req, res);
    return handler(req, res) as ReturnType<H>;
  };
  return Object.assign(wrapped, { logger });
}