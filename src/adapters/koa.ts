import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestLogger } from '../core/logger';
import type { Options, WithLogger } from '../core/types';

interface KoaLikeContext {
  req: IncomingMessage;
  res: ServerResponse;
  originalUrl: string;
  _matchedRoute?: string; // set by @koa/router
  routerPath?: string;
}

/**
 * Koa.
 *
 *   app.use(koaMiddleware({ apiKey, serviceName }));
 */
export function koaMiddleware(
  opts?: Options
): WithLogger<(ctx: KoaLikeContext, next: () => Promise<unknown>) => Promise<void>> {
  const logger = new RequestLogger(opts);
  const mw = async (ctx: KoaLikeContext, next: () => Promise<unknown>): Promise<void> => {
    let error: Error | undefined;
    logger.track(ctx.req, ctx.res, {
      getUrl: () => ctx.originalUrl,
      getRoute: () => ctx._matchedRoute ?? ctx.routerPath,
      getError: () => error,
    });
    try {
      await next();
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };
  return Object.assign(mw, { logger });
}