'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  onUsageUpdate: (callback) => {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status));
  },
  resize: (height) => ipcRenderer.send('widget-resize', height),
  openDashboard: () => ipcRenderer.send('widget-open-dashboard'),
});
