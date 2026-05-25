const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const VITE_BIN = path.join(CLIENT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
const SERVER_PUBLIC_DIR = path.join(ROOT_DIR, 'server', 'public');
const ARCHIVE_DIR = path.join(ROOT_DIR, 'build', 'archives');
const TEMP_ROOT_DIR = path.join(ROOT_DIR, 'build', 'temp', 'update-staging');
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const args = process.argv.slice(2);
const versionFlagIndex = args.indexOf('--version');
const rawVersion = process.env.UPDATE_VERSION || (versionFlagIndex >= 0 ? args[versionFlagIndex + 1] : '');
const normalizedVersion = String(rawVersion || '').trim().replace(/[^0-9A-Za-z._-]+/g, '-');
const tempDir = path.join(TEMP_ROOT_DIR, `temp_update_${timestamp}`);
const zipName = normalizedVersion ? `update_${normalizedVersion}_${timestamp}.zip` : `update_${timestamp}.zip`;
const zipPath = path.join(ARCHIVE_DIR, zipName);

const copyTargets = [
  { source: 'server/src', target: 'server/src' },
  { source: 'server/package.json', target: 'server/package.json' },
  { source: 'server/ecosystem.config.js', target: 'server/ecosystem.config.js' },
  { source: 'server/public', target: 'server/public' },
  { source: 'client/src', target: 'client/src' },
  { source: 'client/package.json', target: 'client/package.json' },
  { source: 'client/dist', target: 'client/dist' },
  { source: 'scripts', target: 'scripts' },
  { source: 'docs', target: 'docs' }
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function runClientBuild() {
  console.log('[1/4] 本地构建前端...');
  execSync(`"${process.execPath}" "${VITE_BIN}" build`, {
    cwd: CLIENT_DIR,
    stdio: 'inherit',
  });
}

function syncServerPublic() {
  console.log('[1.5/4] 同步前端产物到 server/public...');
  removePath(SERVER_PUBLIC_DIR);
  copyRecursive(path.join(CLIENT_DIR, 'dist'), SERVER_PUBLIC_DIR);
}

function stageFiles() {
  console.log('[2/4] 整理更新包目录结构...');
  ensureDir(TEMP_ROOT_DIR);
  ensureDir(tempDir);
  for (const item of copyTargets) {
    const sourcePath = path.join(ROOT_DIR, item.source);
    const targetPath = path.join(tempDir, item.target);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`缺少打包文件: ${item.source}`);
    }
    copyRecursive(sourcePath, targetPath);
  }
}

function createZip() {
  console.log('[3/4] 生成 ZIP 更新包...');
  ensureDir(ARCHIVE_DIR);

  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${tempDir}${path.sep}*' -DestinationPath '${zipPath}' -Force`
    ], { stdio: 'inherit' });
    return;
  }

  const zipBinary = os.platform() === 'darwin' ? 'ditto' : 'zip';
  if (zipBinary === 'ditto') {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', tempDir, zipPath], {
      stdio: 'inherit'
    });
  } else {
    execFileSync('zip', ['-r', zipPath, '.'], {
      cwd: tempDir,
      stdio: 'inherit'
    });
  }
}

function verifyDist() {
  const indexPath = path.join(CLIENT_DIR, 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('前端构建产物缺失：client/dist/index.html');
  }
}

try {
  console.log('========================================');
  console.log('开始生成更新包');
  console.log('========================================');

  removePath(tempDir);
  runClientBuild();
  verifyDist();
  syncServerPublic();
  stageFiles();
  createZip();

  console.log('[4/4] 清理临时目录...');
  removePath(tempDir);
  console.log('');
  console.log('========================================');
  console.log(`更新包已生成: ${zipPath}`);
  console.log('规则：已先本地构建，再按 server/client 根目录结构打包');
  console.log('========================================');
} catch (error) {
  removePath(tempDir);
  console.error('生成更新包失败:', error.message);
  process.exit(1);
}
