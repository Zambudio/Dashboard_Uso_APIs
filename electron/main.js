'use strict';

const { app, dialog, safeStorage, shell, utilityProcess } = require('electron');
const path = require('path');
// electron-store >=9 es ESM puro; require() en CommonJS devuelve el módulo
// namespace, no la clase directamente — hay que tirar de .default.
const Store = require('electron-store').default;
const { startCredentialBroker } = require('./credential-broker');
const { waitForServer, spawnServer } = require('./server-manager');
const { createTray } = require('./tray');
const { createWidgetWindow } = require('./widget-window');
const { startUsagePolling } = require('./usage-poller');

const PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const HOST = '127.0.0.1';
const SERVER_URL = `http://${HOST}:${PORT}`;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const store = new Store();
  let serverChild = null;
  let widgetWindow = null;
  let tray = null;
  let stopPolling = null;

  app.on('second-instance', () => {
    if (widgetWindow) {
      if (widgetWindow.isMinimized()) widgetWindow.restore();
      widgetWindow.show();
      widgetWindow.focus();
    }
  });

  function standaloneDir() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'standalone-bundle')
      : path.join(__dirname, '..', 'build', 'standalone-bundle');
  }

  function envFilePath() {
    return app.isPackaged
      ? path.join(app.getPath('userData'), '.env')
      : path.join(__dirname, '..', '.env');
  }

  async function startServer(broker) {
    console.log('[widget] Arrancando servidor en ' + SERVER_URL);
    serverChild = spawnServer({
      standaloneDir: standaloneDir(),
      port: PORT,
      host: HOST,
      envFile: envFilePath(),
      forkProcess: utilityProcess.fork,
      brokerUrl: broker.url,
      brokerToken: broker.token,
      onExit: (code) => {
        console.log('[widget] Servidor Next.js terminó con código ' + code);
        serverChild = null;
        if (tray) tray.setServerDown();
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('server-status', { down: true });
        }
      },
    });
    const up = await waitForServer(HOST, PORT);
    if (!up) {
      console.error('[widget] El servidor no respondió a tiempo.');
      return false;
    }
    console.log('[widget] Servidor listo.');
    return true;
  }

  async function restartServer(broker) {
    if (serverChild) {
      serverChild.kill();
      serverChild = null;
    }
    await startServer(broker);
  }

  app.whenReady().then(async () => {
    const broker = await startCredentialBroker({
      safeStorage,
      filePath: path.join(app.getPath('userData'), 'credentials.enc'),
      legacyEnvPath: envFilePath(),
      configStore: store,
    });
    console.log('[widget] Broker de credenciales escuchando en ' + broker.url);

    const ok = await startServer(broker);
    if (!ok) return;

    widgetWindow = createWidgetWindow({ store, serverUrl: SERVER_URL });

    tray = createTray({
      onShowWidget: () => { widgetWindow.show(); widgetWindow.focus(); },
      onOpenBrowser: () => shell.openExternal(SERVER_URL),
      onRestartServer: () => restartServer(broker),
      onQuit: () => app.quit(),
    });

    stopPolling = startUsagePolling({
      serverUrl: SERVER_URL,
      onUpdate: (snapshot) => {
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          // Un sondeo que sí responde confirma que el servidor está vivo:
          // limpia cualquier aviso de "servidor no responde" previo antes
          // de empujar los datos nuevos.
          widgetWindow.webContents.send('server-status', { down: false });
          widgetWindow.webContents.send('usage-update', snapshot);
        }
        if (tray) tray.updateFromProviders(snapshot.providers || []);
      },
      onError: (err) => {
        console.error('[widget] Error consultando el dashboard:', err.message);
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('server-status', { down: true });
        }
      },
    });
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[widget] Error fatal durante el arranque:', message);
    dialog.showErrorBox('Dashboard Uso APIs no pudo iniciarse', `${message}\n\nNo se ha guardado ninguna credencial sin cifrar.`);
    app.quit();
  });

  app.on('window-all-closed', () => {
    // La bandeja mantiene la app viva; este proyecto solo soporta Windows.
  });

  app.on('before-quit', () => {
    if (stopPolling) stopPolling();
    if (serverChild) serverChild.kill();
    if (tray) tray.destroy();
  });
}
