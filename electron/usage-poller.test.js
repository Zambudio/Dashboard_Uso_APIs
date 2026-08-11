'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startUsagePolling } = require('./usage-poller');

test('startUsagePolling calls onUpdate immediately and again after the configured interval', async () => {
  let calls = 0;
  const fakeSnapshot = async () => {
    calls++;
    return { providers: [], preferences: { refreshWidgetSeconds: 0.02 } }; // 20ms
  };
  const updates = [];
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: (s) => updates.push(s), fetchSnapshot: fakeSnapshot });
  await new Promise((r) => setTimeout(r, 60));
  stop();
  assert.ok(calls >= 2, `expected at least 2 polls, got ${calls}`);
  assert.ok(updates.length >= 2);
});

test('startUsagePolling reports fetch failures via onError instead of throwing', async () => {
  const errors = [];
  const fakeSnapshot = async () => { throw new Error('network down'); };
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: () => {}, onError: (e) => errors.push(e), defaultIntervalMs: 20, fetchSnapshot: fakeSnapshot });
  await new Promise((r) => setTimeout(r, 30));
  stop();
  assert.ok(errors.length >= 1);
  assert.equal(errors[0].message, 'network down');
});

test('stop() prevents further polling', async () => {
  let calls = 0;
  const fakeSnapshot = async () => { calls++; return { providers: [], preferences: { refreshWidgetSeconds: 0.01 } }; };
  const stop = startUsagePolling({ serverUrl: 'http://x', onUpdate: () => {}, fetchSnapshot: fakeSnapshot });
  await new Promise((r) => setTimeout(r, 15));
  stop();
  const callsAtStop = calls;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, callsAtStop);
});
