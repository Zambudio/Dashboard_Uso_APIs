'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { probePort, waitForServer } = require('./server-manager');

test('probePort resolves true when something answers on that host/port', async () => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  assert.equal(await probePort('127.0.0.1', port), true);
  await new Promise((resolve) => server.close(resolve));
});

test('probePort resolves false when nothing is listening', async () => {
  assert.equal(await probePort('127.0.0.1', 1, 200), false);
});

test('waitForServer gives up and resolves false after exhausting its retries', async () => {
  const result = await waitForServer('127.0.0.1', 1, { retries: 2, delayMs: 10 });
  assert.equal(result, false);
});

test('waitForServer resolves true as soon as the port starts responding', async () => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const result = await waitForServer('127.0.0.1', port, { retries: 5, delayMs: 10 });
  assert.equal(result, true);
  await new Promise((resolve) => server.close(resolve));
});
