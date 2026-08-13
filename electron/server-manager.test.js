'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { probePort, waitForServer, spawnServer } = require('./server-manager');

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

test('spawnServer uses an Electron utility process without enabling run-as-node', () => {
  let received;
  const child = { on: () => {} };
  const result = spawnServer({
    standaloneDir: 'C:\\app\\standalone-bundle',
    port: 3210,
    host: '127.0.0.1',
    envFile: 'C:\\app-data\\.env',
    brokerUrl: 'http://127.0.0.1:4321',
    brokerToken: 'test-token',
    forkProcess: (modulePath, args, options) => {
      received = { modulePath, args, options };
      return child;
    },
  });

  assert.equal(result, child);
  assert.match(received.modulePath, /server-entry\.js$/);
  assert.deepEqual(received.args, []);
  assert.equal(received.options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(received.options.env.PORT, '3210');
  assert.equal(received.options.env.DASHBOARD_CRED_BROKER_TOKEN, 'test-token');
});
