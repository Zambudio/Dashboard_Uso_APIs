'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  assertSafeTarget,
  copyTrackedFiles,
  createElectronEnvironment,
  gitManifest,
  resolveLocalWorktree,
} = require('./run-electron-dev');

test('resolveLocalWorktree always stages development under LOCALAPPDATA', () => {
  const localAppData = path.join('C:', 'Users', 'test', 'AppData', 'Local');
  const target = resolveLocalWorktree({ LOCALAPPDATA: localAppData });
  assert.equal(target, path.join(localAppData, 'DashboardUsoAPIs', 'dev-worktree'));
  assert.doesNotThrow(() => assertSafeTarget(target, { LOCALAPPDATA: localAppData }));
});

test('copyTrackedFiles copies only the explicit Git manifest and removes stale tracked files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-dev-source-'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-dev-target-'));
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'export default 1;');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=not-copied');
  fs.writeFileSync(path.join(target, 'obsolete.js'), 'old');
  fs.writeFileSync(path.join(target, '.dashboard-source-manifest.json'), JSON.stringify(['obsolete.js']));

  copyTrackedFiles(root, target, ['app/page.tsx']);

  assert.equal(fs.readFileSync(path.join(target, 'app', 'page.tsx'), 'utf8'), 'export default 1;');
  assert.equal(fs.existsSync(path.join(target, '.env')), false);
  assert.equal(fs.existsSync(path.join(target, 'obsolete.js')), false);
});

test('gitManifest excludes tracked files deleted in the current worktree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-dev-git-'));
  spawnSync('git', ['init', '--quiet'], { cwd: root });
  fs.writeFileSync(path.join(root, 'kept.txt'), 'kept');
  fs.writeFileSync(path.join(root, 'deleted.txt'), 'deleted');
  spawnSync('git', ['add', 'kept.txt', 'deleted.txt'], { cwd: root });
  fs.rmSync(path.join(root, 'deleted.txt'));

  assert.deepEqual(gitManifest(root), ['kept.txt']);
});

test('createElectronEnvironment isolates dev user data and port from an installed instance', () => {
  const localAppData = path.join('C:', 'Users', 'test', 'AppData', 'Local');
  const env = createElectronEnvironment({
    LOCALAPPDATA: localAppData,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_OPTIONS: '--inspect',
  });

  assert.equal(env.DASHBOARD_PORT, '32123');
  assert.equal(env.DASHBOARD_DEV_USER_DATA, path.join(localAppData, 'DashboardUsoAPIs', 'dev-user-data'));
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
});
