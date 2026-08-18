'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  resolveLocalWorktree,
  assertSafeTarget,
  copyTrackedFiles,
  gitManifest,
} = require('./run-electron-dev');

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !fs.existsSync(npmCli)) {
    throw new Error('npm no comunicó la ruta de npm-cli.js. Ejecuta este comando mediante npm.');
  }
  run(process.execPath, [npmCli, ...args], cwd);
}

function main() {
  const source = path.resolve(__dirname, '..');

  // Genera iconos primero
  console.log('[build] Generando iconos...');
  run(process.execPath, ['scripts/generate-icons.js'], source);

  const isNetworkDrive = !source.startsWith('C:') && !source.startsWith('c:');
  const target = isNetworkDrive ? resolveLocalWorktree() : source;

  if (isNetworkDrive) {
    assertSafeTarget(target);
    console.log(`[build] Entorno SMB detectado. Preparando staging NTFS en ${target}`);
    copyTrackedFiles(source, target, gitManifest(source));

    for (const transient of ['.next', 'build', 'dist']) {
      fs.rmSync(path.join(target, transient), { recursive: true, force: true });
    }

    const electronModule = path.join(target, 'node_modules', 'electron');
    if (!fs.existsSync(path.join(electronModule, 'index.js'))) {
      console.log('[build] Instalando dependencias en la copia local...');
      runNpm(['ci'], target);
    }
  }

  console.log('[build] Compilando Next.js...');
  runNpm(['run', 'build'], target);

  console.log('[build] Preparando paquete standalone...');
  run(process.execPath, ['scripts/prepare-standalone.js'], target);

  console.log('[build] Empaquetando con electron-builder...');
  const electronBuilderCli = path.join(target, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [electronBuilderCli, '--win', '--publish', 'never'], target);

  if (isNetworkDrive) {
    console.log('[build] Copiando instalador y ejecutables a dist/...');
    const sourceDist = path.join(target, 'dist');
    const destDist = path.join(source, 'dist');
    fs.mkdirSync(destDist, { recursive: true });

    const files = fs.readdirSync(sourceDist);
    for (const file of files) {
      const srcFile = path.join(sourceDist, file);
      const dstFile = path.join(destDist, file);
      const stat = fs.statSync(srcFile);
      if (stat.isFile()) {
        fs.copyFileSync(srcFile, dstFile);
        console.log(`[build] Generado: ${file} (${stat.size} bytes)`);
      }
    }
  }

  console.log('[build] ¡Compilación y empaquetado finalizados con éxito!');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[build] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
