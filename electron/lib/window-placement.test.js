'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBoundsUsable, revealWindowOnDisplay } = require('./window-placement');

const PRIMARY = { x: 0, y: 0, width: 3440, height: 1392 };

test('a window on another monitor is not usable on the display where the tray was clicked', () => {
  const upperMonitorBounds = { x: 1, y: -1438, width: 340, height: 148 };
  assert.equal(isBoundsUsable(upperMonitorBounds, [PRIMARY]), false);
});

test('a tiny visible sliver is not enough to consider a saved position usable', () => {
  const almostOutside = { x: 3439, y: 100, width: 340, height: 148 };
  assert.equal(isBoundsUsable(almostOutside, [PRIMARY]), false);
});

test('revealing a hidden widget restores and centers it on the selected display', () => {
  const calls = [];
  const win = {
    isMinimized: () => true,
    restore: () => calls.push(['restore']),
    getBounds: () => ({ x: 1, y: -1438, width: 340, height: 148 }),
    setPosition: (x, y) => calls.push(['setPosition', x, y]),
    show: () => calls.push(['show']),
    moveTop: () => calls.push(['moveTop']),
    focus: () => calls.push(['focus']),
  };

  revealWindowOnDisplay(win, PRIMARY);

  assert.deepEqual(calls, [
    ['restore'],
    ['setPosition', 1550, 622],
    ['show'],
    ['moveTop'],
    ['focus'],
  ]);
});

test('revealing an already visible widget does not move it unnecessarily', () => {
  const calls = [];
  const win = {
    isMinimized: () => false,
    getBounds: () => ({ x: 100, y: 100, width: 340, height: 148 }),
    setPosition: (x, y) => calls.push(['setPosition', x, y]),
    show: () => calls.push(['show']),
    moveTop: () => calls.push(['moveTop']),
    focus: () => calls.push(['focus']),
  };

  revealWindowOnDisplay(win, PRIMARY);

  assert.deepEqual(calls, [['show'], ['moveTop'], ['focus']]);
});
