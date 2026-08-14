'use strict';

const MIN_VISIBLE_WIDTH = 96;
const MIN_VISIBLE_HEIGHT = 48;

function intersectionSize(bounds, area) {
  return {
    width: Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)),
    height: Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)),
  };
}

function isBoundsUsable(bounds, workAreas) {
  return workAreas.some((area) => {
    const intersection = intersectionSize(bounds, area);
    return (
      intersection.width >= Math.min(MIN_VISIBLE_WIDTH, bounds.width) &&
      intersection.height >= Math.min(MIN_VISIBLE_HEIGHT, bounds.height)
    );
  });
}

function centeredPosition(area, width, height) {
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

function revealWindowOnDisplay(win, workArea) {
  if (win.isMinimized()) win.restore();
  const bounds = win.getBounds();
  if (!isBoundsUsable(bounds, [workArea])) {
    const position = centeredPosition(workArea, bounds.width, bounds.height);
    win.setPosition(position.x, position.y);
  }
  win.show();
  if (typeof win.moveTop === 'function') win.moveTop();
  win.focus();
}

module.exports = { centeredPosition, isBoundsUsable, revealWindowOnDisplay };
