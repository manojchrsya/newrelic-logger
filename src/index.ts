// Framework adapters
export { expressMiddleware } from './adapters/express';
export { fastifyPlugin } from './adapters/fastify';
export { koaMiddleware } from './adapters/koa';
export { withRequestLogging } from './adapters/http';

// Core
export { RequestLogger } from './core/logger';
export type { TrackHooks } from './core/logger';
export { NewRelicClient } from './core/client';
export * from './core/types';