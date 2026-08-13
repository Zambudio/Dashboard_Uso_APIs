'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MANIFEST_FILE = '.dashboard-source-manifest.json';

function resolveLocalWorktree(env = process.env) {
  if (!env.LOCALAPPDATA) {
    throw new Error('LOCALAPPDATA no está definido; no se puede preparar una copia NTFS segura.');
  }
  return path.join(env.LOCALAPPDATA, 'DashboardUsoAPIs', 'dev-worktree');
}

function assertSafeTarget(target, env = process.env) {
  const expected = path.resolve(resolveLocalWorktree(env));
  if (path.resolve(target) !== expected) {
    throw new Error(`Directorio de desarrollo no permitido: ${target}`);
  }
}

function safeRelativePath(file) {
  const normalized = file.replaceAll('/', path.sep);
  if (!file || file.includes('\0') || path.isAbsolute(normalized)) return null;
  const segments = normalized.split(path.sep);
  if (segments.some((segment) => segment === '..' || segment === '')) return null;
  return normalized;
}

function readManifest(target) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(target, MANIFEST_FILE), 'utf8'));
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function resolveInside(base, relative) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, relative);
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Ruta fuera del directorio permitido: ${relative}`);
  }
  return resolved;
}

function copyTrackedFiles(source, target, files) {
  fs.mkdirSync(target, { recursive: true });
  const normalizedFiles = files.map(safeRelativePath);
  if (normalizedFiles.some((file) => file === null)) {
    throw new Error('Git devolvió una ruta no segura; se cancela la copia de desarrollo.');
  }

  const nextSet = new Set(normalizedFiles);
  for (const previous of readManifest(target)) {
    const normalizedPrevious = safeRelativePath(previous);
    if (normalizedPrevious && !nextSet.has(normalizedPrevious)) {
      fs.rmSync(resolveInside(target, normalizedPrevious), { force: true });
    }
  }

  for (const relative of normalizedFiles) {
    const from = resolveInside(source, relative);
    const to = resolveInside(target, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  fs.writeFileSync(path.join(target, MANIFEST_FILE), JSON.stringify(normalizedFiles, null, 2));
}

function gitManifest(source) {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: source, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(`No se pudo obtener el manifiesto de Git: ${result.stderr || result.error?.message || 'error desconocido'}`);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function fileHash(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !fs.existsSync(npmCli)) {
    throw new Error('npm no comunicó la ruta de npm-cli.js. Ejecuta este lanzador mediante npm run electron:dev.');
  }
  run(process.execPath, [npmCli, ...args], cwd);
}

function createElectronEnvironment(env = process.env) {
  const electronEnv = { ...env };
  electronEnv.DASHBOARD_PORT ||= '32123';
  electronEnv.DASHBOARD_DEV_USER_DATA = path.join(
    env.LOCALAPPDATA,
    'DashboardUsoAPIs',
    'dev-user-data'
  );
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  delete electronEnv.NODE_OPTIONS;
  return electronEnv;
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('El arranque Electron asistido está diseñado para Windows.');
  }

  const source = path.resolve(__dirname, '..');
  const target = resolveLocalWorktree();
  assertSafeTarget(target);
  const sourceLock = path.join(source, 'package-lock.json');
  const previousLockHash = fileHash(path.join(target, 'package-lock.json'));

  console.log(`[electron:dev] Preparando copia NTFS en ${target}`);
  copyTrackedFiles(source, target, gitManifest(source));

  for (const transient of ['.next', 'build']) {
    fs.rmSync(resolveInside(target, transient), { recursive: true, force: true });
  }

  const electronModule = path.join(target, 'node_modules', 'electron');
  if (previousLockHash !== fileHash(sourceLock) || !fs.existsSync(path.join(electronModule, 'index.js'))) {
    console.log('[electron:dev] Instalando dependencias en la copia local...');
    runNpm(['ci'], target);
  }

  console.log('[electron:dev] Compilando Next.js en NTFS...');
  runNpm(['run', 'build'], target);
  run(process.execPath, ['scripts/prepare-standalone.js'], target);

  // Electron 43 descarga su binario de forma diferida al cargar el módulo.
  const electronExecutable = require(electronModule);
  const electronEnv = createElectronEnvironment();
  console.log('[electron:dev] Arrancando widget. Ciérralo desde el icono de la bandeja para terminar.');
  run(electronExecutable, ['.'], target, electronEnv);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[electron:dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertSafeTarget,
  copyTrackedFiles,
  createElectronEnvironment,
  resolveLocalWorktree,
};
