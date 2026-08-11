'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { COLORS, worstStatusColor, generateBadgeBuffer } = require('./tray-badge');

test('worstStatusColor prioritizes critical over warning and ok', () => {
  assert.deepEqual(worstStatusColor(['online', 'warning', 'error']), COLORS.critical);
});

test('worstStatusColor returns warning when nothing is worse', () => {
  assert.deepEqual(worstStatusColor(['online', 'warning']), COLORS.warning);
});

test('worstStatusColor returns neutral when every provider is unconfigured', () => {
  assert.deepEqual(worstStatusColor(['unconfigured', 'unconfigured']), COLORS.neutral);
});

test('worstStatusColor returns neutral for an empty list', () => {
  assert.deepEqual(worstStatusColor([]), COLORS.neutral);
});

test('worstStatusColor returns ok when everything is online', () => {
  assert.deepEqual(worstStatusColor(['online', 'online']), COLORS.ok);
});

test('generateBadgeBuffer fills every pixel with the requested opaque color', () => {
  const { width, height, buffer } = generateBadgeBuffer(COLORS.critical, 4);
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.equal(buffer.length, 4 * 4 * 4);
  const lastOffset = (4 * 4 - 1) * 4;
  assert.deepEqual(
    [buffer[lastOffset], buffer[lastOffset + 1], buffer[lastOffset + 2], buffer[lastOffset + 3]],
    [244, 63, 94, 255]
  );
});
