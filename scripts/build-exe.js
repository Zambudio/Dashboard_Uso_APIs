'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nextStandalone = path.join(root, '.next', 'standalone');
const dist = path.join(root, 'dist');
const distStandalone = path.join(dist, 'standalone');

if (!fs.existsSync(path.join(nextStandalone, 'server.js'))) {
  console.error('No se encuentra .next/standalone/server.js. Ejecuta antes: npm run build');
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

// The exe stays tiny: it only packages launcher.js. The compiled Next.js
// app ships as a plain folder ("standalone") sitting next to dashboard.exe,
// and the launcher spawns Node against standalone/server.js at runtime.
// This avoids pkg's asset-embedding entirely, which is what made the
// previous single-file-exe approach unreliable (see HANDOVER_PACKAGING.md).
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyDir(nextStandalone, distStandalone);
// `next build` with output:'standalone' does NOT copy static assets or the
// public/ folder into .next/standalone — that's a documented manual step.
copyDir(path.join(root, '.next', 'static'), path.join(distStandalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(distStandalone, 'public'));

// Next's output tracing only follows static require()/import graphs, so it
// misses playwright's cli.js (referenced by a runtime-built path string,
// used to auto-install Chromium on first Claude Pro use). Overwrite with
// the full packages (~19MB, no browser binaries) instead of the partial
// trace, so cli.js and its whole dependency tree are guaranteed present.
copyDir(path.join(root, 'node_modules', 'playwright'), path.join(distStandalone, 'node_modules', 'playwright'));
copyDir(path.join(root, 'node_modules', 'playwright-core'), path.join(distStandalone, 'node_modules', 'playwright-core'));

const envExampleSrc = path.join(root, '.env_example');
if (fs.existsSync(envExampleSrc)) {
  fs.copyFileSync(envExampleSrc, path.join(dist, '.env_example'));
}

// launcher.js spawns server-entry.js instead of standalone/server.js
// directly; it requires inspector-shim.js first (see that file for why).
fs.copyFileSync(path.join(root, 'inspector-shim.js'), path.join(dist, 'inspector-shim.js'));
fs.copyFileSync(path.join(root, 'server-entry.js'), path.join(dist, 'server-entry.js'));

const pkgBin = path.join(root, 'node_modules', '.bin', 'pkg');
const result = spawnSync(
  pkgBin,
  [
    'launcher.js',
    '--targets',
    'node22-win-x64',
    '--output',
    path.join(dist, 'dashboard.exe'),
    '--compress',
    'GZip',
  ],
  { stdio: 'inherit', cwd: root, shell: true }
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const windowsDir = process.env.WINDIR || 'C:\\Windows';
const cscCandidates = [
  path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windowsDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));
if (!csc) {
  console.error('No se encontró el compilador C# de .NET Framework para crear DashboardTray.exe.');
  process.exit(1);
}

const trayResult = spawnSync(
  csc,
  [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    `/out:${path.join(dist, 'DashboardTray.exe')}`,
    '/reference:System.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    path.join(root, 'scripts', 'tray-launcher.cs'),
  ],
  { stdio: 'inherit', cwd: root }
);

if (trayResult.status !== 0) {
  process.exit(trayResult.status || 1);
}

console.log('');
console.log('[pack] Listo. Contenido de dist/:');
console.log('  dist/DashboardTray.exe <- lanzador recomendado (icono de bandeja, sin consola)');
console.log('  dist/dashboard.exe   <- ejecutable');
console.log('  dist/standalone/     <- build de Next.js (debe ir siempre junto al exe)');
console.log('  dist/.env_example    <- plantilla de claves');
console.log('');
console.log('[pack] Para distribuir: copia toda la carpeta dist/ (o comprímela en zip).');
process.exit(0);
