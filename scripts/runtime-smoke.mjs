/** Runtime smoke test for the compiled ESM and CommonJS package entry points. */
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esm = await import('newrelic-transport');
const cjs = require('newrelic-transport');

function assertExports(label, pkg) {
  for (const name of ['expressMiddleware', 'fastifyPlugin', 'koaMiddleware', 'withRequestLogging', 'RequestLogger', 'NewRelicClient']) {
    assert.equal(typeof pkg[name], 'function', `${label} should export ${name}`);
  }
  console.log(`  ✓ ${label} exports`);
}

function makeRequest(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/smoke?token=should-be-redacted',
      method: 'GET',
      headers: { authorization: 'Bearer should-be-redacted' },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    });
    req.on('error', reject);
    req.end();
  });
}

async function assertRequestLogging(label, pkg) {
  const entries = [];
  let flushCalls = 0;
  let shutdownCalls = 0;
  const sink = {
    push(entry) {
      entries.push(entry);
    },
    async flush() {
      flushCalls++;
    },
    async shutdown() {
      shutdownCalls++;
    },
  };
  const handler = pkg.withRequestLogging({
    client: sink,
    logHeaders: true,
    customAttributes: () => ({ smokeTest: true }),
  }, (_req, res) => {
    res.statusCode = 201;
    res.end('ok');
  });
  const server = http.createServer(handler);

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object', `${label} server should have a TCP address`);
    const response = await makeRequest(address.port);
    assert.equal(response.statusCode, 201, `${label} should preserve the handler response`);
    assert.ok(response.headers['x-request-id'], `${label} should return a request ID`);

    await handler.logger.flush();
    assert.equal(entries.length, 1, `${label} should enqueue one completed request`);
    const [entry] = entries;
    assert.match(entry.message, /^GET \/smoke 201 \d+(\.\d+)?ms$/, `${label} should format the request message`);
    assert.equal(entry.attributes.method, 'GET');
    assert.equal(entry.attributes.path, '/smoke');
    assert.equal(entry.attributes.statusCode, 201);
    assert.equal(entry.attributes.requestId, response.headers['x-request-id']);
    assert.equal(entry.attributes.smokeTest, true);
    assert.match(entry.attributes.url, /token=%5BREDACTED%5D/);
    assert.doesNotMatch(entry.attributes.url, /should-be-redacted/);
    assert.equal(JSON.parse(entry.attributes.headers).authorization, '[REDACTED]');
    assert.equal(flushCalls, 1, `${label} logger.flush() should flush the configured sink`);
    console.log(`  ✓ ${label} HTTP request logging`);
  } finally {
    await handler.logger.shutdown();
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }

  assert.equal(shutdownCalls, 1, `${label} logger.shutdown() should shut down the configured sink`);
  console.log(`  ✓ ${label} sink shutdown`);
}

assertExports('ESM entry point', esm);
assertExports('CommonJS entry point', cjs);
await assertRequestLogging('ESM', esm);
await assertRequestLogging('CommonJS', cjs);

console.log('\n✅ All runtime smoke checks passed');
