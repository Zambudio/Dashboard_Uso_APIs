'use strict';

const { BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');

const WIDGET_WIDTH = 340;
const HEADER_HEIGHT = 56;
const CARD_HEIGHT = 64;

function isPositionOnScreen(x, y, width, height) {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y;
  });
}

function getCenteredPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

function createWidgetWindow({ store, serverUrl }) {
  const initialHeight = HEADER_HEIGHT + CARD_HEIGHT;
  let savedPosition = store.get('windowPosition');
  if (savedPosition && !isPositionOnScreen(savedPosition.x, savedPosition.y, WIDGET_WIDTH, initialHeight)) {
    savedPosition = null;
  }

  const win = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: initialHeight,
    x: savedPosition ? savedPosition.x : undefined,
    y: savedPosition ? savedPosition.y : undefined,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!savedPosition) {
    const { x, y } = getCenteredPosition(WIDGET_WIDTH, initialHeight);
    win.setPosition(x, y);
  }

  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'));

  let saveTimer = null;
  win.on('move', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      store.set('windowPosition', { x, y });
    }, 300);
  });

  // Cerrar la ventana solo la oculta — la bandeja es la única forma de
  // salir de verdad (mismo patrón que el proyecto de referencia).
  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  ipcMain.on('widget-resize', (event, height) => {
    if (event.sender !== win.webContents) return;
    const [width] = win.getSize();
    // El suelo es solo la cabecera, no initialHeight (cabecera+tarjeta):
    // con la ventana colapsada, el contenido real es más bajo que
    // initialHeight y debe poder encoger hasta ahí.
    win.setContentSize(width, Math.max(HEADER_HEIGHT, Math.round(height)));
  });

  ipcMain.on('widget-open-dashboard', () => {
    shell.openExternal(serverUrl);
  });

  return win;
}

module.exports = { createWidgetWindow, isPositionOnScreen, getCenteredPosition };
