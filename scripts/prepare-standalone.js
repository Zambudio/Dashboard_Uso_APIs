'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nextStandalone = path.join(root, '.next', 'standalone');
const bundleDir = path.join(root, 'build', 'standalone-bundle');
const bundleStandalone = path.join(bundleDir, 'standalone');

if (!fs.existsSync(path.join(nextStandalone, 'server.js'))) {
  console.error('No se encuentra .next/standalone/server.js. Ejecuta antes: npm run build');
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

// maxRetries/retryDelay: en la unidad de red (N:\, SMB) un rmSync
// recursivo puede fallar con ENOTEMPTY de forma transitoria (el listado de
// la carpeta que se está borrando llega desincronizado del estado real por
// la latencia de red) — sin retry, el build entero abortaba en este paso
// de forma intermitente y sin relación con el código.
fs.rmSync(bundleDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
fs.mkdirSync(bundleDir, { recursive: true });

copyDir(nextStandalone, bundleStandalone);
// `next build` con output:'standalone' no copia assets estáticos ni public/
// — electron-builder necesita que los añadamos al bundle preparado.
copyDir(path.join(root, '.next', 'static'), path.join(bundleStandalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(bundleStandalone, 'public'));

// El tracing de Next solo sigue require()/import estáticos, así que se
// pierde playwright/cli.js (referenciado con una ruta construida en
// runtime, usada para instalar Chromium en el primer login de Claude
// Pro/DeepSeek). Se copian los paquetes completos en vez de confiar en el
// tracing parcial; por eso se copian explícitamente estos dos paquetes.
copyDir(path.join(root, 'node_modules', 'playwright'), path.join(bundleStandalone, 'node_modules', 'playwright'));
copyDir(path.join(root, 'node_modules', 'playwright-core'), path.join(bundleStandalone, 'node_modules', 'playwright-core'));

fs.copyFileSync(path.join(root, 'inspector-shim.js'), path.join(bundleDir, 'inspector-shim.js'));
fs.copyFileSync(path.join(root, 'server-entry.js'), path.join(bundleDir, 'server-entry.js'));

console.log('[prepare-standalone] Bundle listo en build/standalone-bundle/');
