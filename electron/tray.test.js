'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTooltip } = require('./tray');

test('summarizeTooltip reports weekly utilization when present', () => {
  const text = summarizeTooltip([{ name: 'Claude Pro', usage: { weeklyUtilization: 42.4 } }]);
  assert.equal(text, 'Claude Pro: 42% semanal');
});

test('summarizeTooltip falls back to session utilization', () => {
  const text = summarizeTooltip([{ name: 'Gemini', usage: { sessionUtilization: 10 } }]);
  assert.equal(text, 'Gemini: 10% sesión');
});

test('summarizeTooltip shows balance for API-key providers', () => {
  const text = summarizeTooltip([{ name: 'DeepSeek', usage: { balance: 12.5, currency: 'USD' } }]);
  assert.equal(text, 'DeepSeek: 12.50 USD');
});

test('summarizeTooltip reports missing sessions without inventing data', () => {
  const text = summarizeTooltip([{ name: 'OpenAI', usage: { error: 'sesión caducada' } }]);
  assert.equal(text, 'OpenAI: sin sesión');
});

test('summarizeTooltip handles an empty provider list', () => {
  assert.equal(summarizeTooltip([]), 'Dashboard de uso de APIs — sin proveedores configurados');
});
