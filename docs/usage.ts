// Example only: install the framework you use (express / fastify / koa).
import express from 'express';
// import Fastify from 'fastify'
// import Koa from 'koa';
// import router from '@koa/router';
// import { NestFactory } from '@nestjs/core';

import { 
  expressMiddleware,
  fastifyPlugin,
  koaMiddleware,
  // withRequestLogging
} from '../src';
import type { Options } from '../src';
// import * as http from 'node:http';
import * as dotenv from 'dotenv';
dotenv.config();

const options: Options = {
  apiKey: process.env.NEW_RELIC_LICENSE_KEY,
  serviceName: 'orders-api',
  region: 'EU',
  ignorePaths: ['/health'],
  logHeaders: true,
  customAttributes: (req) => ({
    tenant: req.headers['x-tenant-id'] as string,
    userId: req.headers['x-user-id'] as string,
  }),
};

// --- Express (also NestJS with the Express adapter: app.use(...) in main.ts)
const app = express();
options.customAttributes = () => ({ source: 'express' });
app.use(expressMiddleware(options));
app.get('/hello', (_req, res) => res.json({ ok: true }));
app.listen(3000);

// --- Fastify (also NestJS with the Fastify adapter)
// const fastify = Fastify();
// options.customAttributes = () => ({ source: 'fastify' });
// fastify.register(fastifyPlugin, options);
// fastify.get('/', (_request, reply) => reply.send({ hello: 'world' }));
// fastify.listen({ port: 3000 }).then(() => console.log('Fastify server listening on port 3000'));

// --- Koa
// const koa = new Koa();
// const _ = new router();
// options.customAttributes = () => ({ source: 'koa' });
// koa.use(koaMiddleware(options));
// _.get('/', (ctx: { body: { hello: string; }; }) => { ctx.body = { hello: 'world' }});
// koa.use(_.routes());
// koa.listen(3000, () => console.log('Koa server listening on port 3000'));

// --- NestJS (Express adapter)
// class AppModule {}
// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.use(expressMiddleware(options));
//   await app.listen(3000);
// }
// bootstrap();

// --- Plain http
// http.createServer(withRequestLogging(options, (_req, res) => res.end('ok'))).listen(3001);

void fastifyPlugin; void koaMiddleware; // referenced above in comments