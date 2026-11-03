/** Smoke-test the packed npm artifact from an isolated consumer project. */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'newrelic-transport-package-smoke-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tscCommand = path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);

function run(command, args, cwd = temporaryRoot) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(temporaryRoot, '.npm-cache'),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

try {
  const [packResult] = JSON.parse(
    run(npmCommand, ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryRoot], repositoryRoot),
  );
  const tarballPath = path.join(temporaryRoot, packResult.filename);
  const packageRoot = path.join(temporaryRoot, 'node_modules', packageJson.name);

  fs.writeFileSync(
    path.join(temporaryRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
  );
  fs.mkdirSync(packageRoot, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', packageRoot, '--strip-components=1']);

  for (const expectedFile of [
    'dist/esm/index.js',
    'dist/cjs/index.js',
    'dist/cjs/package.json',
    'dist/types/index.d.ts',
  ]) {
    if (!fs.existsSync(path.join(packageRoot, expectedFile))) {
      throw new Error(`Packed artifact is missing ${expectedFile}`);
    }
  }

  fs.writeFileSync(
    path.join(temporaryRoot, 'consumer.mjs'),
    `import assert from 'node:assert/strict';
import * as pkg from '${packageJson.name}';

for (const name of ['expressMiddleware', 'fastifyPlugin', 'koaMiddleware', 'withRequestLogging', 'RequestLogger', 'NewRelicClient']) {
  assert.equal(typeof pkg[name], 'function', \`ESM package should export \${name}\`);
}

const entries = [];
const logger = new pkg.RequestLogger({
  client: {
    push(entry) { entries.push(entry); },
    async flush() {},
    async shutdown() {},
  },
});
logger.record({
  req: {},
  res: {},
  requestId: 'smoke-request',
  method: 'GET',
  url: '/smoke?token=secret-value',
  status: 201,
  durationMs: 2,
  headers: {},
});
assert.equal(entries.length, 1);
assert.equal(entries[0].attributes.statusCode, 201);
assert.equal(entries[0].attributes.requestId, 'smoke-request');
assert.doesNotMatch(entries[0].attributes.url, /secret-value/);
`,
  );
  run(process.execPath, ['consumer.mjs']);

  fs.writeFileSync(
    path.join(temporaryRoot, 'consumer.cjs'),
    `const assert = require('node:assert/strict');
const pkg = require('${packageJson.name}');

for (const name of ['expressMiddleware', 'fastifyPlugin', 'koaMiddleware', 'withRequestLogging', 'RequestLogger', 'NewRelicClient']) {
  assert.equal(typeof pkg[name], 'function', \`CommonJS package should export \${name}\`);
}

const entries = [];
const logger = new pkg.RequestLogger({
  client: {
    push(entry) { entries.push(entry); },
    async flush() {},
    async shutdown() {},
  },
});
logger.record({
  req: {},
  res: {},
  requestId: 'smoke-request',
  method: 'GET',
  url: '/smoke?token=secret-value',
  status: 201,
  durationMs: 2,
  headers: {},
});
assert.equal(entries.length, 1);
assert.equal(entries[0].attributes.statusCode, 201);
assert.equal(entries[0].attributes.requestId, 'smoke-request');
assert.doesNotMatch(entries[0].attributes.url, /secret-value/);
`,
  );
  run(process.execPath, ['consumer.cjs']);

  fs.writeFileSync(
    path.join(temporaryRoot, 'consumer.ts'),
    `import { NewRelicClient, RequestLogger, type LogEntry, type LogSink, type Options } from '${packageJson.name}';

const entry: LogEntry = {
  timestamp: Date.now(),
  message: 'GET /smoke 200 2ms',
  attributes: { method: 'GET', statusCode: 200 },
};
const sink: LogSink = {
  push(log) { void log.message; },
  async flush() {},
  async shutdown() {},
};
const options: Options = { client: sink, serviceName: 'package-smoke' };
const logger = new RequestLogger(options);
const NewRelicClientConstructor: typeof NewRelicClient = NewRelicClient;
void entry;
void logger;
void NewRelicClientConstructor;
`,
  );
  run(tscCommand, [
    '--strict',
    '--noEmit',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--types',
    'node',
    '--typeRoots',
    path.join(repositoryRoot, 'node_modules', '@types'),
    'consumer.ts',
  ]);

  console.log('✅ Packed npm artifact passed ESM, CommonJS, TypeScript, exports, and redaction smoke checks');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
