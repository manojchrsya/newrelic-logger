// Framework adapters
export { expressMiddleware } from './adapters/express.js';
export { fastifyPlugin } from './adapters/fastify.js';
export { koaMiddleware } from './adapters/koa.js';
export { withRequestLogging } from './adapters/http.js';

// Core
export { RequestLogger } from './core/logger.js';
export type { TrackHooks } from './core/logger.js';
export { NewRelicClient } from './core/client.js';
export * from './core/types.js';