'use strict';

// Generación pura de buffers RGBA — sin 'require(electron)' aquí, para que
// sea testeable con `node --test` sin que Electron esté corriendo.
// electron/tray.js envuelve el resultado con nativeImage.createFromBuffer(),
// eso sí necesita el runtime real de Electron.
const COLORS = {
  ok: { r: 16, g: 185, b: 129 },       // emerald-500, igual que 'online' en ProviderCard
  warning: { r: 245, g: 158, b: 11 },  // amber-500, igual que 'warning' en ProviderCard
  critical: { r: 244, g: 63, b: 94 },  // rose-500, igual que 'offline'/'error' en ProviderCard
  neutral: { r: 100, g: 116, b: 139 }, // slate-500, igual que 'unconfigured' en ProviderCard
};

// El peor estado entre todos los proveedores decide el color del icono
// único de bandeja — replica statusColors de ProviderCard.tsx para que el
// icono nunca sugiera algo que las tarjetas no dicen.
function worstStatusColor(statuses) {
  if (statuses.some((s) => s === 'error' || s === 'offline')) return COLORS.critical;
  if (statuses.some((s) => s === 'warning')) return COLORS.warning;
  if (statuses.length === 0 || statuses.every((s) => s === 'unconfigured')) return COLORS.neutral;
  return COLORS.ok;
}

function generateBadgeBuffer(color, size = 16) {
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    buffer[offset] = color.r;
    buffer[offset + 1] = color.g;
    buffer[offset + 2] = color.b;
    buffer[offset + 3] = 255;
  }
  return { width: size, height: size, buffer };
}

module.exports = { COLORS, worstStatusColor, generateBadgeBuffer };
