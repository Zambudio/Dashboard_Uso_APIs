'use strict';

const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');
const { setProviderHidden, updatePreferences } = require('./usage-poller');
const { centeredPosition, isBoundsUsable, revealWindowOnDisplay } = require('./lib/window-placement');

const WIDGET_WIDTH = 340;
const HEADER_HEIGHT = 56;
const CARD_HEIGHT = 92;

function isPositionOnScreen(x, y, width, height) {
  return isBoundsUsable(
    { x, y, width, height },
    screen.getAllDisplays().map((display) => display.workArea)
  );
}

function getCenteredPosition(width, height) {
  return centeredPosition(screen.getPrimaryDisplay().workArea, width, height);
}

function revealWidgetWindow(win) {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  revealWindowOnDisplay(win, cursorDisplay.workArea);
}

function createWidgetWindow({ store, serverUrl }) {
  const initialHeight = HEADER_HEIGHT + CARD_HEIGHT;
  let savedPosition = store.get('windowPosition');
  if (savedPosition && !isPositionOnScreen(savedPosition.x, savedPosition.y, WIDGET_WIDTH, initialHeight)) {
    savedPosition = null;
  }

  const nativeSettings = store.get('widgetSettings', { alwaysOnTop: true, openAtLogin: false });
  const win = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: initialHeight,
    x: savedPosition ? savedPosition.x : undefined,
    y: savedPosition ? savedPosition.y : undefined,
    frame: false,
    transparent: true,
    // '#00000000' (transparente explícito) en vez de dejarlo por defecto:
    // en Windows, un BrowserWindow transparent:true sin backgroundColor
    // explícito a veces sigue pintando un fondo opaco por debajo del
    // primer paint de la página, y ese rectángulo opaco asoma por las
    // esquinas que el CSS (border-radius en <body>) redondea por encima.
    backgroundColor: '#00000000',
    // Sin esto, Windows sigue dibujando la sombra rectangular por defecto
    // detrás de la ventana transparente: el contenido (body) ya sale con
    // esquinas redondeadas por CSS, pero esa sombra cuadrada asomando por
    // detrás hace que se vea como si no lo estuviera.
    hasShadow: false,
    alwaysOnTop: nativeSettings.alwaysOnTop !== false,
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, '..', 'assets', 'app-icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!savedPosition) {
    const { x, y } = getCenteredPosition(WIDGET_WIDTH, initialHeight);
    win.setPosition(x, y);
  }

  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // Reenvía la consola del renderer (file://, sin DevTools abiertas por
  // defecto) a la consola del proceso principal: sin esto, un error de JS en
  // widget.js queda invisible tanto en producción como al depurar.
  win.webContents.on('console-message', (event) => {
    console.log('[widget-renderer]', event.message);
  });

  let saveTimer = null;
  win.on('move', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      store.set('windowPosition', { x, y });
    }, 300);
  });

  // Cerrar la ventana solo la oculta — la bandeja es la única forma de
  // salir de verdad (mismo patrón que el proyecto de referencia). El botón
  // "✕" de la cabecera reproduce este mismo comportamiento (ver
  // 'widget-close' más abajo), no un cierre real de la app.
  const hideWindow = () => win.hide();
  win.on('close', (event) => {
    event.preventDefault();
    hideWindow();
  });

  ipcMain.on('widget-resize', (event, height) => {
    if (event.sender !== win.webContents) return;
    const [width] = win.getSize();
    // El suelo es solo la cabecera, no initialHeight (cabecera+tarjeta):
    // con la ventana colapsada, el contenido real es más bajo que
    // initialHeight y debe poder encoger hasta ahí.
    const maxHeight = screen.getDisplayMatching(win.getBounds()).workArea.height;
    const safeHeight = Number.isFinite(height) ? Math.round(height) : HEADER_HEIGHT;
    win.setContentSize(width, Math.min(maxHeight, Math.max(HEADER_HEIGHT, safeHeight)));
  });

  ipcMain.on('widget-open-dashboard', () => {
    shell.openExternal(serverUrl);
  });

  ipcMain.on('widget-minimize', (event) => {
    if (event.sender !== win.webContents) return;
    win.minimize();
  });

  ipcMain.on('widget-close', (event) => {
    if (event.sender !== win.webContents) return;
    hideWindow();
  });

  ipcMain.on('widget-set-provider-hidden', (event, payload) => {
    if (event.sender !== win.webContents) return;
    const { id, hidden } = payload || {};
    if (!id) return;
    setProviderHidden(serverUrl, id, Boolean(hidden)).catch((err) => {
      console.error('[widget] Error al cambiar la visibilidad de un proveedor:', err.message);
    });
  });

  ipcMain.handle('widget-get-settings', (event) => {
    if (event.sender !== win.webContents) throw new Error('Origen IPC no autorizado.');
    const current = store.get('widgetSettings', { alwaysOnTop: true, openAtLogin: false });
    return {
      alwaysOnTop: current.alwaysOnTop !== false,
      openAtLogin: app.isPackaged ? app.getLoginItemSettings().openAtLogin : Boolean(current.openAtLogin),
      collapsed: Boolean(store.get('widgetCollapsed', false)),
    };
  });

  ipcMain.handle('widget-set-collapsed', (event, collapsed) => {
    if (event.sender !== win.webContents) throw new Error('Origen IPC no autorizado.');
    store.set('widgetCollapsed', Boolean(collapsed));
    return { ok: true };
  });

  ipcMain.handle('widget-save-settings', async (event, payload) => {
    if (event.sender !== win.webContents) throw new Error('Origen IPC no autorizado.');
    if (!payload || typeof payload !== 'object') throw new Error('ConfiguraciÃ³n invÃ¡lida.');

    const themes = new Set(['aurora', 'esmeralda', 'ambar', 'violeta', 'mono']);
    const opacity = Math.min(100, Math.max(30, Number(payload.widgetOpacity) || 92));
    const refresh = Math.min(86400, Math.max(15, Number(payload.refreshWidgetSeconds) || 300));
    const hiddenIds = Array.isArray(payload.widgetHiddenProviderIds)
      ? payload.widgetHiddenProviderIds.filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id))
      : [];
    const preferences = await updatePreferences(serverUrl, {
      widgetOpacity: opacity,
      refreshWidgetSeconds: refresh,
      widgetTheme: themes.has(payload.widgetTheme) ? payload.widgetTheme : 'aurora',
      widgetHiddenProviderIds: hiddenIds,
    });

    const nextNativeSettings = {
      alwaysOnTop: payload.alwaysOnTop !== false,
      openAtLogin: Boolean(payload.openAtLogin),
    };
    store.set('widgetSettings', nextNativeSettings);
    win.setAlwaysOnTop(nextNativeSettings.alwaysOnTop);
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: nextNativeSettings.openAtLogin });
    return { ok: true, preferences, ...nextNativeSettings };
  });

  return win;
}

module.exports = { createWidgetWindow, getCenteredPosition, isPositionOnScreen, revealWidgetWindow };
