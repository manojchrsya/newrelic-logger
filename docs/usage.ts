// Example only: install the framework you use (express / fastify / koa).
import express from 'express';
import { expressMiddleware, fastifyPlugin, koaMiddleware, withRequestLogging } from '../src';
import type { Options } from '../src';
import * as http from 'node:http';
import * as dotenv from 'dotenv';
dotenv.config();

const options: Options = {
  apiKey: process.env.NEW_RELIC_LICENSE_KEY,
  serviceName: 'orders-api',
  region: 'EU',
  ignorePaths: ['/health'],
  logHeaders: true,
  customAttributes: (req) => ({ tenant: req.headers['x-tenant-id'] as string }),
};

// --- Express (also NestJS with the Express adapter: app.use(...) in main.ts)
const app = express();
app.use(expressMiddleware(options));
app.get('/hello', (_req, res) => res.json({ ok: true }));
app.listen(3000);

// --- Fastify (also NestJS with the Fastify adapter)
//   const fastify = Fastify();
//   fastify.register(fastifyPlugin, options);

// --- Koa
//   const koa = new Koa();
//   koa.use(koaMiddleware(options));

// --- Plain http
http.createServer(withRequestLogging(options, (_req, res) => res.end('ok'))).listen(3001);

void fastifyPlugin; void koaMiddleware; // referenced above in comments