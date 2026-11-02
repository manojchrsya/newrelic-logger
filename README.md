# newrelic-logger

Zero-dependency request logger that pushes HTTP request logs to the **New Relic Log API** (batched, gzipped, retried). Written in TypeScript; ships compiled CommonJS plus `.d.ts` types.

## Install
```bash
npm i newrelic-logger
```

## Use
```ts
import { expressMiddleware } from 'newrelic-logger';
app.use(expressMiddleware({ apiKey: process.env.NEW_RELIC_LICENSE_KEY, serviceName: 'my-api' }));
```

| Framework | Usage |
|---|---|
| Express / Connect | `app.use(expressMiddleware(opts))` |
| Fastify | `fastify.register(fastifyPlugin, opts)` |
| Koa | `app.use(koaMiddleware(opts))` |
| NestJS | Express or Fastify adapter, as above (in `main.ts`) |
| Plain `http` | `http.createServer(withRequestLogging(opts, handler))` |

## Options
| Option | Default | Notes |
|---|---|---|
| `apiKey` | `NEW_RELIC_LICENSE_KEY` env | License/ingest key |
| `region` | `US` | `EU` uses `log-api.eu.newrelic.com` |
| `serviceName` | `node-service` | Sent as `service.name` |
| `attributes` | `{}` | Added to every log |
| `batchSize` / `flushIntervalMs` | 100 / 5000 | Flush triggers |
| `maxQueueSize` | 10000 | Oldest dropped when exceeded |
| `ignorePaths` | `[]` | Strings (prefix) or RegExps |
| `sampleRate` | 1 | Non-5xx only; errors are always kept |
| `logHeaders` / `redactKeys` | false / [] | Sensitive headers + query params are redacted |
| `customAttributes(req,res)` | - | Add your own attributes (user id, tenant...) |
| `onError(err, batch)` | no-op | Called when delivery fails after retries |
| `client` | built-in | Custom `LogSink` (handy for tests or other transports) |

## Logged attributes
`http.method`, `http.url`, `http.path`, `http.route`, `http.statusCode`, `http.durationMs`, `http.userAgent`, `http.clientIp`, `requestId`, `level`, plus `error.message`/`error.stack` when available.

Query in New Relic: `SELECT * FROM Log WHERE service.name = 'my-api' AND http.statusCode >= 500`

## Graceful shutdown
```ts
const mw = expressMiddleware({ ... });
process.on('SIGTERM', async () => { await mw.logger.shutdown(); process.exit(0); });
```

## Develop
```bash
npm install
npm run build   # tsc -> dist/
```