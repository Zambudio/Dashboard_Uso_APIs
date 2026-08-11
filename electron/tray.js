'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const { worstStatusColor, generateBadgeBuffer, COLORS } = require('./lib/tray-badge');

function iconFromColor(color) {
  const { width, height, buffer } = generateBadgeBuffer(color, 16);
  return nativeImage.createFromBuffer(buffer, { width, height });
}

function summarizeTooltip(providers) {
  if (!providers || providers.length === 0) {
    return 'Dashboard de uso de APIs — sin proveedores configurados';
  }
  const lines = providers.map((p) => {
    const u = p.usage;
    if (!u || u.error) return `${p.name}: sin sesión`;
    if (u.weeklyUtilization !== undefined) return `${p.name}: ${Math.round(u.weeklyUtilization)}% semanal`;
    if (u.sessionUtilization !== undefined) return `${p.name}: ${Math.round(u.sessionUtilization)}% sesión`;
    if (u.balance !== undefined) return `${p.name}: ${u.balance.toFixed(2)} ${u.currency || ''}`.trim();
    return `${p.name}: sin datos`;
  });
  return lines.join('\n');
}

function createTray({ onShowWidget, onOpenBrowser, onRestartServer, onQuit }) {
  const tray = new Tray(iconFromColor(COLORS.neutral));
  tray.setToolTip('Dashboard de uso de APIs — iniciando…');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar widget', click: () => onShowWidget && onShowWidget() },
    { label: 'Abrir en navegador', click: () => onOpenBrowser && onOpenBrowser() },
    { type: 'separator' },
    { label: 'Reiniciar servidor', click: () => onRestartServer && onRestartServer() },
    { type: 'separator' },
    { label: 'Salir', click: () => onQuit && onQuit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => onShowWidget && onShowWidget());

  return {
    updateFromProviders(providers) {
      const color = worstStatusColor(providers.map((p) => p.status));
      tray.setImage(iconFromColor(color));
      tray.setToolTip(summarizeTooltip(providers));
    },
    setServerDown() {
      tray.setImage(iconFromColor(COLORS.critical));
      tray.setToolTip('Dashboard de uso de APIs — el servidor no responde');
    },
    destroy() {
      tray.destroy();
    },
  };
}

module.exports = { createTray, summarizeTooltip };
