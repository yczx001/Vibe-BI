import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureArg = process.argv[2] || 'golden';
const normalizedFixture = fixtureArg === 'degraded' ? 'shipping-parity-degraded-generic-cards' : 'shipping-parity-golden';
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(artifactDir, 'generated');
const payloadPath = path.join(generatedDir, `${normalizedFixture}.browser-preview.json`);

await fs.access(payloadPath);
const payload = await fs.readFile(payloadPath, 'utf8');

const host = '127.0.0.1';
const port = Number(process.env.PARITY_PREVIEW_PORT || 41731);

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
    response.end(payload);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, host, () => {
  const previewUrl = `http://${host}:${port}/preview.json`;
  const desktopUrl = `${process.env.PARITY_DESKTOP_URL || 'http://127.0.0.1:5173'}/?browser-preview=1&preview-url=${encodeURIComponent(previewUrl)}`;
  console.log(`Payload: ${previewUrl}`);
  console.log(`Open in desktop renderer dev server: ${desktopUrl}`);
});
