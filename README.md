# newrelic-transport

[![npm version](https://img.shields.io/npm/v/newrelic-transport.svg)](https://www.npmjs.com/package/newrelic-transport)
[![license](https://img.shields.io/npm/l/newrelic-transport.svg)](https://www.npmjs.com/package/newrelic-transport)
[![node](https://img.shields.io/node/v/newrelic-transport.svg)](https://www.npmjs.com/package/newrelic-transport)
[![types](https://img.shields.io/npm/types/newrelic-transport.svg)](https://www.npmjs.com/package/newrelic-transport)

Drop-in HTTP request logging for Node.js that ships every request to **New Relic Logs**. One middleware, your API key, and you're done. Works with Express, Fastify, Koa, NestJS and plain `http`, with zero runtime dependencies and full TypeScript types.

```ts
import { expressMiddleware } from 'newrelic-transport';

app.use(
  expressMiddleware({
    apiKey: process.env.NEW_RELIC_LICENSE_KEY,
    serviceName: 'orders-api',
  })
);
// GET /orders/42 200 12.34ms  ->  New Relic Logs
```

## 📑 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Framework Integration](#-framework-integration) — [Express](#express), [Fastify](#fastify), [Koa](#koa), [NestJS](#nestjs), [Plain http](#plain-http)
- [Configuration](#-configuration)
- [What Gets Logged](#-what-gets-logged)
- [Privacy & Redaction](#-privacy--redaction)
- [Querying in New Relic](#-querying-in-new-relic)
- [Reliability & Delivery](#-reliability--delivery)
- [Advanced](#-advanced) — [custom attributes](#custom-attributes), [filtering & sampling](#filtering--sampling), [graceful shutdown](#graceful-shutdown), [custom sink](#custom-sink)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- **One-line setup**: add a single middleware or plugin and request logs start flowing to New Relic
- **Framework adapters**: Express / Connect, Fastify, Koa, NestJS (via its Express or Fastify adapter) and plain `http` / `https` servers
- **Zero runtime dependencies**: uses only Node.js built-ins (`https`, `zlib`)
- **Batched and compressed**: logs are queued, grouped into batches and gzipped before sending
- **Resilient delivery**: automatic retries with exponential backoff, payload splitting for oversized batches, and a bounded in-memory queue
- **Privacy by default**: sensitive headers and query parameters (`authorization`, `token`, `password` and more) are redacted, and request or response bodies are never read
- **US and EU regions**: send to `log-api.newrelic.com` or `log-api.eu.newrelic.com`
- **Control what you send**: ignore paths, sample traffic, filter with a callback, and attach your own attributes
- **Request IDs**: reads `x-request-id` or generates one, so you can correlate a request across logs
- **TypeScript first**: written in strict TypeScript, ships `.d.ts` types
- **Pluggable transport**: swap in your own sink for tests or other destinations

## 📦 Installation

```bash
npm install newrelic-transport
# or
yarn add newrelic-transport
# or
pnpm add newrelic-transport
```

Requires **Node.js 16 or newer**. The package ships compiled CommonJS plus type declarations.

You also need a New Relic **ingest license key** (the same kind of key the New Relic APM agent uses). A *User API key* will not work for log ingestion.

## 🚀 Quick Start

1. Put your key in the environment:

   ```bash
   export NEW_RELIC_LICENSE_KEY=your_ingest_license_key
   ```

2. Add the middleware for your framework. For Express:

   ```ts
   import express from 'express';
   import { expressMiddleware } from 'newrelic-transport';

   const app = express();

   app.use(
     expressMiddleware({
       serviceName: 'orders-api', // shown as service.name in New Relic
       region: 'US',              // or 'EU'
     })
   );

   app.get('/hello', (_req, res) => res.json({ ok: true }));
   app.listen(3000);
   ```

3. Call your API (`curl localhost:3000/hello`), then open **New Relic → Logs** and look for `service.name = 'orders-api'`.

If `apiKey` is not passed, the key is read from `NEW_RELIC_LICENSE_KEY` (or `NEW_RELIC_API_KEY`). If neither is set, the constructor throws at startup.

## 🔌 Framework Integration

All adapters take the same [options](#-configuration). Create the middleware once, near the top of your app, so it sees every request.

The examples below load the key from a `.env` file with `dotenv`; this is optional.

```ts
import 'dotenv/config';
import type { Options } from 'newrelic-transport';

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
```

### Express

Also works with Connect.

```ts
import express from 'express';
import { expressMiddleware } from 'newrelic-transport';

const app = express();
app.use(expressMiddleware(options));

app.get('/hello', (_req, res) => res.json({ ok: true }));
app.listen(3000);
```

The Express adapter records the matched route pattern (for example `/api/users/:id`) as `http.route`, which makes grouping by endpoint easy.

### Fastify

Register it as a plugin. It applies to all routes, including those registered in other plugins.

```ts
import Fastify from 'fastify';
import { fastifyPlugin } from 'newrelic-transport';

const fastify = Fastify();
fastify.register(fastifyPlugin, options);

fastify.get('/', (_request, reply) => reply.send({ hello: 'world' }));
fastify.listen({ port: 3000 });
```

The plugin flushes remaining logs automatically when the Fastify instance closes.

### Koa

```ts
import Koa from 'koa';
import Router from '@koa/router';
import { koaMiddleware } from 'newrelic-transport';

const app = new Koa();
const router = new Router();

app.use(koaMiddleware(options)); // register before the router

router.get('/', (ctx) => {
  ctx.body = { hello: 'world' };
});

app.use(router.routes());
app.listen(3000);
```

Errors thrown further down the Koa chain are captured as `error.message` and `error.stack` and re-thrown untouched.

### NestJS

Use the adapter that matches your Nest application.

**Express adapter** (the default), in `main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { expressMiddleware } from 'newrelic-transport';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(expressMiddleware(options));
  await app.listen(3000);
}
bootstrap();
```

**Fastify adapter**:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyPlugin } from 'newrelic-transport';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.register(fastifyPlugin, options);
  await app.listen(3000);
}
bootstrap();
```

### Plain http

```ts
import * as http from 'node:http';
import { withRequestLogging } from 'newrelic-transport';

http
  .createServer(withRequestLogging(options, (_req, res) => res.end('ok')))
  .listen(3001);
```

## 🔧 Configuration

Every option is optional except that an API key must be available, either through `apiKey` or the environment.

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `NEW_RELIC_LICENSE_KEY` env | New Relic ingest license key |
| `region` | `'US' \| 'EU'` | `'US'` | Selects `log-api.newrelic.com` or `log-api.eu.newrelic.com` |
| `host` | `string` | — | Override the Log API host (for proxies or tests) |
| `serviceName` | `string` | `NEW_RELIC_APP_NAME` env, else `'node-service'` | Sent as `service.name` on every log |
| `environment` | `string` | `NODE_ENV`, else `'development'` | Sent as `environment` on every log |
| `attributes` | `Record<string, string \| number \| boolean>` | `{}` | Extra attributes added to every log |
| `batchSize` | `number` | `100` | Logs per request to New Relic; reaching it triggers a flush |
| `flushIntervalMs` | `number` | `5000` | Flush interval for partially filled batches |
| `maxQueueSize` | `number` | `10000` | Max logs held in memory; the oldest are dropped when exceeded |
| `maxRetries` | `number` | `3` | Retries for failed deliveries (429, 5xx, 408, network errors) |
| `timeoutMs` | `number` | `10000` | Timeout for each request to New Relic |
| `flushOnExit` | `boolean` | `true` | Flush the queue on Node's `beforeExit` event |
| `ignorePaths` | `(string \| RegExp)[]` | `[]` | Skip matching paths. Strings match as a prefix; RegExps are tested against the path |
| `sampleRate` | `number` (0 to 1) | `1` | Fraction of non-5xx requests to log. 5xx responses are always logged |
| `shouldLog` | `(info) => boolean` | — | Return `false` to skip a request |
| `logHeaders` | `boolean` | `false` | Include request headers (sensitive ones redacted) |
| `redactKeys` | `string[]` | `[]` | Extra header or query-parameter names to redact (case-insensitive) |
| `customAttributes` | `(req, res) => object` | — | Add your own attributes to each request log |
| `onError` | `(err, batch) => void` | no-op | Called when a batch cannot be delivered after all retries |
| `client` | `LogSink` | built-in client | Provide your own transport (see [Custom sink](#custom-sink)) |

### Environment variables

| Variable | Used for |
|---|---|
| `NEW_RELIC_LICENSE_KEY` | API key (preferred) |
| `NEW_RELIC_API_KEY` | API key (fallback) |
| `NEW_RELIC_APP_NAME` | Default `serviceName` |
| `NODE_ENV` | Default `environment` |

## 📋 What Gets Logged

Each finished request becomes one log entry. The message is `METHOD /path STATUS DURATIONms`, for example:

```
GET /orders/42 200 12.34ms
```

| Attribute | Description |
|---|---|
| `method` | HTTP method |
| `url` | Full URL with the query string, after redaction |
| `path` | Path without the query string |
| `route` | Matched route pattern, such as `/orders/:id` (Express, Fastify, Koa with a router) |
| `statusCode` | Response status code |
| `durationMs` | Time from request start to response finish, in milliseconds |
| `userAgent` | `User-Agent` header |
| `clientIp` | First `x-forwarded-for` value, otherwise the socket address (Fastify uses `request.ip`) |
| `requestHeaders` | JSON string of request headers (only with `logHeaders: true`) |
| `requestId` | `x-request-id` header or a generated UUID |
| `level` | `info` for 1xx to 3xx, `warn` for 4xx, `error` for 5xx |
| `error.message`, `error.stack` | Present when an error was captured (Koa and Fastify) |

Every log also carries these common attributes: `service.name`, `hostname`, `environment`, plus anything you set in `attributes`.

For Express, Koa and plain `http`, the adapter also sets an `x-request-id` header on the response so clients can quote it in bug reports.

## 🔒 Privacy & Redaction

- **Bodies are never read.** Request and response bodies are not logged.
- **Query parameters and headers are redacted** when their name matches this default list (case-insensitive): `authorization`, `cookie`, `set-cookie`, `x-api-key`, `password`, `token`, `access_token`, `refresh_token`, `secret`, `api_key`, `apikey`.
- Redacted values appear as `[REDACTED]` (URL-encoded in `http.url`).
- Add your own names with `redactKeys`:

  ```ts
  expressMiddleware({ ...options, redactKeys: ['x-session-id', 'ssn'] });
  ```

- `logHeaders: true` sends all request headers (minus redacted ones), which can include personal data such as IP addresses or custom identifiers. Leave it off unless you need it, and extend `redactKeys` if you turn it on.
- URL paths are not redacted. Avoid putting secrets or personal data in the path itself.

## 📊 Querying in New Relic

Logs appear under **Logs** in New Relic and can be queried with NRQL:

```sql
-- Recent errors for one service
SELECT * FROM Log
WHERE service.name = 'orders-api' AND statusCode >= 500
SINCE 1 hour ago

-- Error rate over time
SELECT percentage(count(*), WHERE statusCode >= 500)
FROM Log WHERE service.name = 'orders-api'
TIMESERIES SINCE 1 day ago

-- 95th percentile latency per route
SELECT percentile(durationMs, 95)
FROM Log WHERE service.name = 'orders-api'
FACET route SINCE 1 day ago

-- Follow one request
SELECT * FROM Log WHERE requestId = 'your-request-id'
```

## 🔁 Reliability & Delivery

- **Batching:** logs are queued in memory and sent when `batchSize` is reached or every `flushIntervalMs`, whichever comes first.
- **Compression:** each batch is gzipped. If a compressed batch exceeds New Relic's 1 MB payload limit, it is split in half and sent in parts.
- **Retries:** failures that can succeed later (HTTP 429, 5xx, 408, network errors and timeouts) are retried with exponential backoff, starting at 1 second and capped at 15 seconds. Other 4xx responses, such as an invalid key, are not retried.
- **Failure reporting:** when a batch is finally dropped, `onError(err, batch)` is called. Delivery problems never throw into your request handling.
- **Bounded memory:** if New Relic is unreachable for a long time, the queue holds at most `maxQueueSize` entries and drops the oldest first.
- **No request impact:** logging happens after the response is finished, and network calls are asynchronous.

> Logs still in the queue are lost if the process is killed before they are sent. See [Graceful shutdown](#graceful-shutdown).

## 🧩 Advanced

### Custom attributes

`customAttributes` runs once per request, after the response, and its result is merged into the log:

```ts
expressMiddleware({
  ...options,
  customAttributes: (req, res) => ({
    tenant: req.headers['x-tenant-id'] as string,
    cacheStatus: res.getHeader('x-cache') as string,
  }),
});
```

It runs synchronously on the event loop, so keep it fast. If it throws, the error is swallowed and the log is still sent without the extra attributes.

For attributes that never change, use `attributes` instead:

```ts
expressMiddleware({ ...options, attributes: { team: 'payments', version: '1.4.2' } });
```

### Filtering & sampling

```ts
expressMiddleware({
  ...options,
  ignorePaths: ['/health', '/metrics', /^\/static\//],
  sampleRate: 0.1,                       // log ~10% of non-5xx requests; 5xx always logged
  shouldLog: (info) => info.method !== 'OPTIONS',
});
```

`shouldLog` receives the full request info (`method`, `url`, `route`, `status`, `durationMs`, `headers` and more), so you can filter on anything, for example only logging slow requests:

```ts
shouldLog: (info) => info.status >= 400 || info.durationMs > 500,
```

### Graceful shutdown

The queue is flushed automatically when Node emits `beforeExit`. That event does **not** fire on `process.exit()` or when a signal such as `SIGTERM` terminates the process, so flush explicitly in your shutdown handler:

```ts
const logging = expressMiddleware(options);
app.use(logging);

process.on('SIGTERM', async () => {
  await logging.logger.shutdown(); // sends whatever is still queued
  process.exit(0);
});
```

Every Express, Koa and plain-`http` middleware exposes its `RequestLogger` as `.logger`. The Fastify plugin shuts down on its own when the server closes (`await fastify.close()`).

### Custom sink

Pass any object that implements `LogSink` to replace the New Relic client. This is useful for unit tests or to forward logs somewhere else:

```ts
import { expressMiddleware } from 'newrelic-transport';
import type { LogSink, LogEntry } from 'newrelic-transport';

const entries: LogEntry[] = [];
const sink: LogSink = {
  push: (entry) => entries.push(entry),
  flush: async () => {},
  shutdown: async () => {},
};

app.use(expressMiddleware({ client: sink }));
```

When `client` is set, no API key is required.

## 📘 API Reference

### Exports

| Export | Description |
|---|---|
| `expressMiddleware(options?)` | Express / Connect / NestJS (Express) middleware. Returns a function with a `.logger` property |
| `fastifyPlugin` | Fastify / NestJS (Fastify) plugin. Use with `register(fastifyPlugin, options)` |
| `koaMiddleware(options?)` | Koa middleware. Returns a function with a `.logger` property |
| `withRequestLogging(options, handler)` | Wraps a plain `http` request handler. Returns a function with a `.logger` property |
| `RequestLogger` | The core logger the adapters are built on: `record()`, `track()`, `flush()`, `shutdown()` |
| `NewRelicClient` | The batching, compressing transport to the New Relic Log API |

### Types

`Options`, `LogSink`, `LogEntry`, `RequestInfo`, `Region`, `LogLevel`, `AttributeValue`, `WithLogger`, `TrackHooks`.

```ts
import type { Options, RequestInfo } from 'newrelic-transport';
```

### `RequestLogger`

| Method | Description |
|---|---|
| `flush()` | Sends everything currently queued and resolves when done |
| `shutdown()` | Stops the flush timer, then flushes and waits for in-flight requests |
| `record(info)` | Builds and queues one log entry from a `RequestInfo` |
| `track(req, res, hooks?)` | Starts timing a Node `http` request and records it when the response finishes |

## 🛠 Troubleshooting

**Nothing shows up in New Relic**

1. Check the key is an **ingest license key**, not a User API key.
2. Check the region. An EU account needs `region: 'EU'`.
3. Make sure the process stays alive long enough to flush (default 5 seconds), or call `shutdown()` before exiting.
4. Turn on error reporting to see why delivery fails:

   ```ts
   expressMiddleware({
     ...options,
     onError: (err, batch) => console.error(`Dropped ${batch.length} logs:`, err.message),
   });
   ```

   A message such as `New Relic Log API responded 403` usually means a wrong key or region.

**Some requests are missing**

Check `ignorePaths`, `sampleRate` and `shouldLog`. Sampling skips non-5xx requests when `sampleRate` is below `1`.

**`http.route` is empty**

The route is only known when your framework exposes it: Express (once a route matched), Fastify, and Koa with `@koa/router`. For plain `http`, use `http.path`.

**Startup error: `apiKey is required`**

Pass `apiKey` or set `NEW_RELIC_LICENSE_KEY`. If you load `.env` with `dotenv`, make sure it runs before the middleware is created.

## ❓ FAQ

**Does this replace the New Relic APM agent?**

No. It ships request logs only. It does not collect traces, metrics or errors the way the APM agent does, and the two can run side by side.

**Will it slow down my requests?**

The work done during a request is small: it reads a few headers, starts a timer and registers event listeners. Building the log entry happens after the response is finished, and network calls are asynchronous. Compressing each batch is a short synchronous step on the event loop. If you log very large attributes at high volume, reduce `batchSize` or the data you attach.

**What happens if New Relic is down?**

Logs are retried with backoff and kept in a bounded in-memory queue. If the outage outlasts the retries or the queue fills up, the oldest logs are dropped and `onError` is called. Your application keeps serving requests.

**Can I run it in tests without sending data?**

Yes. Pass a [custom sink](#custom-sink) as `client`; no key or network is needed.

**Is `http.clientIp` trustworthy?**

For Express, Koa and plain `http`, it uses the first value of `x-forwarded-for` when present, which a client can fake unless a trusted proxy sets or overwrites that header. Fastify uses `request.ip`, which respects Fastify's `trustProxy` setting.

**Does it log request bodies?**

No. Bodies are never read or sent.

## 🤝 Contributing

Contributions are welcome. To work on the package locally:

```bash
npm install
npm run build   # compiles src/ to dist/ with tsc
```

Please open an issue to discuss larger changes before sending a pull request.

## 📄 License

[MIT](./LICENSE)