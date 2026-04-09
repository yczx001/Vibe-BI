import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(artifactDir, 'generated');

const fixtureSpecs = [
  {
    name: 'golden',
    file: 'shipping-parity-golden.browser-preview.json',
    expectedStyleFamily: 'boardroom-editorial',
    expectedLayoutArchetype: 'parity-operational-single-page',
    minQueryCount: 4,
    minPrefetchedCount: 4,
  },
  {
    name: 'degraded',
    file: 'shipping-parity-degraded-generic-cards.browser-preview.json',
    expectedStyleFamily: 'boardroom-editorial',
    expectedLayoutArchetype: 'parity-operational-single-page',
    minQueryCount: 4,
    minPrefetchedCount: 4,
  },
];

await runNodeScript('verify-parity-fixtures.mjs');
await runNodeScript('build-browser-preview-payload.mjs');

for (const fixture of fixtureSpecs) {
  const payloadPath = path.join(generatedDir, fixture.file);
  const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
  assertPayload(payload, fixture);
  const server = await startPayloadServer(payload);
  try {
    await expectJson(`${server.baseUrl}/health`, (data) => data?.ok === true, `${fixture.name}: /health should return ok=true`);
    await expectJson(
      `${server.baseUrl}/preview.json`,
      (data) => data?.report?.runtimeHints?.styleFamily === fixture.expectedStyleFamily
        && data?.report?.runtimeHints?.layoutArchetype === fixture.expectedLayoutArchetype,
      `${fixture.name}: preview payload should preserve parity runtime hints`,
    );
    console.log(`[smoke] ${fixture.name}: ${server.baseUrl}/preview.json OK`);
  } finally {
    await stopPayloadServer(server.instance);
  }
}

console.log('[smoke] parity browser-preview smoke passed');

function assertPayload(payload, fixture) {
  if (!payload?.report || !payload?.pages?.length || !payload?.queries?.length) {
    throw new Error(`${fixture.name}: payload must contain report/pages/queries`);
  }

  if (payload.report.runtimeHints?.styleFamily !== fixture.expectedStyleFamily) {
    throw new Error(`${fixture.name}: expected styleFamily=${fixture.expectedStyleFamily}`);
  }

  if (payload.report.runtimeHints?.layoutArchetype !== fixture.expectedLayoutArchetype) {
    throw new Error(`${fixture.name}: expected layoutArchetype=${fixture.expectedLayoutArchetype}`);
  }

  if ((payload.queries?.length || 0) < fixture.minQueryCount) {
    throw new Error(`${fixture.name}: expected at least ${fixture.minQueryCount} queries`);
  }

  const prefetchedCount = Object.keys(payload.prefetchedRowsByQuery || {}).length;
  if (prefetchedCount < fixture.minPrefetchedCount) {
    throw new Error(`${fixture.name}: expected at least ${fixture.minPrefetchedCount} prefetched query results`);
  }
}

function runNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(artifactDir, scriptName)], {
      cwd: path.resolve(artifactDir, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${scriptName} exited with code ${code}\n${stderr}`));
    });
  });
}

function startPayloadServer(payload) {
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === '/preview.json') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to resolve preview server address'));
        return;
      }
      resolve({
        instance: server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function stopPayloadServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    });
  });
}

async function expectJson(url, predicate, failureMessage) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`${failureMessage}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!predicate(payload)) {
    throw new Error(failureMessage);
  }
}
