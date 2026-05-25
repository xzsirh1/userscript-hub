const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const db = require('../models/database');
const { authMiddleware: auth } = require('../middleware/auth');
const multer = require('multer');
const AdmZip = require('adm-zip');

// 检测是否在 Docker 环境中
const IS_DOCKER = fs.existsSync('/.dockerenv') || process.env.DOCKER_ENV === 'true';

// 运行目录
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const RUNTIME_ROOT = IS_DOCKER ? path.resolve(__dirname, '../..') : PROJECT_ROOT;
const UPLOAD_DIR = path.join(RUNTIME_ROOT, 'uploads/updates');
const PUBLIC_DIR = IS_DOCKER ? path.join(RUNTIME_ROOT, 'public') : path.join(PROJECT_ROOT, 'client/dist');
const CLIENT_DIR = path.join(PROJECT_ROOT, 'client');
const VITE_BIN = path.join(CLIENT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

async function runClientBuild(options = {}) {
  const installDependencies = options.installDependencies === true;
  let output = '';

  if (installDependencies || !fs.existsSync(VITE_BIN)) {
    try {
      const { stdout = '', stderr = '' } = await execAsync('npm install', {
        cwd: CLIENT_DIR,
        timeout: 300000
      });
      output += `npm install\n${stdout}\n${stderr}\n`;
    } catch (error) {
      output += `npm install failed: ${error.message || error}\n`;
      if (!fs.existsSync(VITE_BIN)) {
        throw error;
      }
    }
  }

  if (!fs.existsSync(VITE_BIN)) {
    throw new Error('client build tool not found: vite');
  }

  const buildCommand = `"${process.execPath}" "${VITE_BIN}" build`;
  const { stdout = '', stderr = '' } = await execAsync(buildCommand, {
    cwd: CLIENT_DIR,
    timeout: 300000
  });

  output += `${stdout}\n${stderr}`;
  return output.trim();
}

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `update_${Date.now()}.zip`)
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 ZIP 格式'));
    }
  }
});

// 获取当前版本信息
router.get('/version', auth, (req, res) => {
  try {
    let version = { version: '1.0.0', buildTime: null };
    const versionFile = IS_DOCKER
      ? path.join(RUNTIME_ROOT, 'src/version.json')
      : path.join(PROJECT_ROOT, 'server/src/version.json');
    if (fs.existsSync(versionFile)) {
      version = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    }

    // 获取 PM2 进程名配置
    const pm2Config = db.prepare("SELECT value FROM site_config WHERE key = 'pm2_process_name'").get();

    res.json({
      code: 200,
      data: {
        ...version,
        pm2ProcessName: pm2Config?.value || 'userscript-hub'
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 设置 PM2 进程名
router.put('/pm2-config', auth, (req, res) => {
  try {
    const { processName } = req.body;
    db.prepare("INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES ('pm2_process_name', ?, CURRENT_TIMESTAMP)").run(processName || 'userscript-hub');
    res.json({ code: 200, message: '保存成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 上传更新包
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  let logId = null;

  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传更新包' });
    }

    const zipPath = req.file.path;

    // 创建更新日志
    const result = db.prepare(`INSERT INTO update_logs (status, details) VALUES ('processing', '正在处理更新包...')`).run();
    logId = result.lastInsertRowid;

    // 解压前备份
    const backupDir = path.join(UPLOAD_DIR, `backup_${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });

    // 备份关键目录
    for (const item of getBackupItems()) {
      if (fs.existsSync(item.sourcePath)) {
        copyPathSync(item.sourcePath, path.join(backupDir, item.backupPath));
      }
    }

    // 解压更新包
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    // 安全检查：只允许更新特定目录
    const allowedPaths = ['server/src/', 'server/ecosystem.config.js', 'client/src/', 'client/dist/', 'scripts/', 'docs/', 'server/package.json', 'client/package.json'];
    const blockedPaths = ['.env', 'data/', 'uploads/', 'node_modules/'];

    let filesUpdated = 0;
    const updatedFiles = [];

    for (const entry of zipEntries) {
      const entryName = entry.entryName.replace(/\\/g, '/');

      // 跳过目录
      if (entry.isDirectory) continue;

      // 检查是否在允许的路径中
      const isAllowed = allowedPaths.some(p => entryName.startsWith(p) || entryName.includes('/' + p));
      const isBlocked = blockedPaths.some(p => entryName.includes(p));

      if (!isAllowed || isBlocked) {
        continue;
      }

      // 提取文件
      const targetPath = resolveUpdateTargetPath(entryName);
      if (!targetPath) {
        continue;
      }
      const targetDir = path.dirname(targetPath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, entry.getData());
      filesUpdated++;
      updatedFiles.push(entryName);
    }

    // 删除上传的 zip 文件
    fs.unlinkSync(zipPath);

    // 更新日志
    const duration = Date.now() - startTime;
    db.prepare(`UPDATE update_logs SET status = 'uploaded', details = ?, files_updated = ?, duration = ? WHERE id = ?`).run(
      `已解压 ${filesUpdated} 个文件，等待构建`,
      filesUpdated,
      duration,
      logId
    );

    res.json({
      code: 200,
      message: `更新包已解压，共 ${filesUpdated} 个文件`,
      data: {
        logId,
        filesUpdated,
        files: updatedFiles.slice(0, 20), // 只返回前20个
        backupDir: path.basename(backupDir)
      }
    });
  } catch (e) {
    console.error('上传更新包失败:', e);
    if (logId) {
      db.prepare(`UPDATE update_logs SET status = 'failed', details = ? WHERE id = ?`).run(e.message, logId);
    }
    res.status(500).json({ code: 500, message: '更新失败: ' + e.message });
  }
});

// 执行构建
router.post('/build', auth, async (req, res) => {
  const startTime = Date.now();

  try {
    // 创建日志
    const result = db.prepare(`INSERT INTO update_logs (status, details) VALUES ('building', '正在构建前端...')`).run();
    const logId = result.lastInsertRowid;

    if (IS_DOCKER) {
      // Docker 环境使用预构建前端产物，不在容器内执行 client 构建
      const output = 'Docker 部署使用预构建前端文件，已跳过容器内构建。若更新前端，请确保更新包包含 client/dist。';

      const duration = Date.now() - startTime;
      db.prepare(`UPDATE update_logs SET status = 'built', details = ?, duration = ? WHERE id = ?`).run(
        'Docker 预构建模式，无需容器内构建',
        duration,
        logId
      );
      res.json({ code: 200, message: '构建完成', data: { logId, output: output.slice(-2000) } });
    } else {
      // 非 Docker 环境
      const clientDir = path.join(PROJECT_ROOT, 'client');
      let output = '';

      try {
        const { stdout: installOut } = await execAsync('npm install', { cwd: clientDir, timeout: 300000 });
        output += '依赖安装完成\n' + installOut + '\n';
      } catch (e) {
        output += '依赖安装: ' + (e.message || '完成') + '\n';
      }

      output = await runClientBuild();

      const duration = Date.now() - startTime;
      db.prepare(`UPDATE update_logs SET status = 'built', details = ?, duration = ? WHERE id = ?`).run(
        '前端构建完成',
        duration,
        logId
      );
      res.json({ code: 200, message: '构建完成', data: { logId, output: output.slice(-2000) } });
    }
  } catch (e) {
    console.error('构建失败:', e);
    res.status(500).json({ code: 500, message: '构建失败: ' + e.message });
  }
});

// 重启服务
router.post('/restart', auth, async (req, res) => {
  try {
    if (IS_DOCKER) {
      // Docker 环境
      db.prepare(`INSERT INTO update_logs (status, details) VALUES ('restarting', '正在重启 Docker 容器...')`).run();
      res.json({ code: 200, message: `正在重启 Docker 容器，页面将在几秒后刷新` });

      setTimeout(async () => {
        triggerDockerRestart();
      }, 1000);
    } else {
      // 非 Docker 环境
      const pm2Config = db.prepare("SELECT value FROM site_config WHERE key = 'pm2_process_name'").get();
      const processName = pm2Config?.value || 'userscript-hub';

      db.prepare(`INSERT INTO update_logs (status, details) VALUES ('restarting', ?)`).run(`正在重启 ${processName}...`);
      res.json({ code: 200, message: `正在重启 ${processName}，页面将在几秒后刷新` });

      setTimeout(async () => {
        try {
          await execAsync(`pm2 restart ${processName}`);
          console.log(`[更新] PM2 进程 ${processName} 已重启`);
        } catch (e) {
          console.error('[更新] 重启失败:', e.message);
          try {
            await execAsync('pm2 restart all');
            console.log('[更新] PM2 所有进程已重启');
          } catch (e2) {
            console.error('[更新] pm2 restart all 也失败:', e2.message);
          }
        }
      }, 1000);
    }
  } catch (e) {
    console.error('重启失败:', e);
    res.status(500).json({ code: 500, message: '重启失败: ' + e.message });
  }
});

// 一键更新（上传+构建+重启）
router.post('/execute', auth, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  let logId = null;

  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传更新包' });
    }

    const zipPath = req.file.path;

    // 创建更新日志
    const result = db.prepare(`INSERT INTO update_logs (status, details) VALUES ('processing', '开始一键更新...')`).run();
    logId = result.lastInsertRowid;

    // 0. 解压前备份（新增安全机制）
    try {
      const backupDir = path.join(UPLOAD_DIR, `backup_${Date.now()}`);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      // 备份关键目录
      for (const item of getBackupItems()) {
        if (fs.existsSync(item.sourcePath)) {
          copyPathSync(item.sourcePath, path.join(backupDir, item.backupPath));
        }
      }
      db.prepare(`UPDATE update_logs SET details = ? WHERE id = ?`).run(`已自动备份当前版本`, logId);
    } catch (backupErr) {
      console.warn('自动备份失败，继续更新:', backupErr);
    }

    // 1. 解压
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    const allowedPaths = ['server/src/', 'server/ecosystem.config.js', 'client/src/', 'client/dist/', 'scripts/', 'docs/', 'server/package.json', 'client/package.json'];
    const blockedPaths = ['.env', 'data/', 'uploads/', 'node_modules/'];

    let filesUpdated = 0;

    for (const entry of zipEntries) {
      const entryName = entry.entryName.replace(/\\/g, '/');
      if (entry.isDirectory) continue;

      const isAllowed = allowedPaths.some(p => entryName.startsWith(p) || entryName.includes('/' + p));
      const isBlocked = blockedPaths.some(p => entryName.includes(p));

      if (!isAllowed || isBlocked) continue;

      const targetPath = resolveUpdateTargetPath(entryName);
      if (!targetPath) continue;
      const targetDir = path.dirname(targetPath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, entry.getData());
      filesUpdated++;
    }

    fs.unlinkSync(zipPath);

    // 检查是否有 dist 目录被更新
    const hasDistUpdate = zipEntries.some(e => e.entryName.replace(/\\/g, '/').includes('client/dist/'));

    // 优化更新逻辑：只要包含 dist，就跳过构建（支持宝塔/PM2/Docker）
    if (hasDistUpdate) {
      if (IS_DOCKER) {
        db.prepare(`UPDATE update_logs SET details = ? WHERE id = ?`).run(`检测到预构建文件，已直接部署到 public 目录...`, logId);
      } else {
        // 宝塔/PM2 环境：解压时已覆盖 client/dist，直接跳过构建
        db.prepare(`UPDATE update_logs SET details = ? WHERE id = ?`).run(`检测到预构建文件，跳过构建过程...`, logId);
      }
    } else {
      if (IS_DOCKER) {
        db.prepare(`UPDATE update_logs SET details = ? WHERE id = ?`).run(`已解压 ${filesUpdated} 个文件。Docker 模式未检测到 client/dist，已跳过前端构建，请上传包含预构建文件的更新包。`, logId);
      } else {
        // 没有预构建文件：执行完整构建流程
        db.prepare(`UPDATE update_logs SET details = ? WHERE id = ?`).run(`已解压 ${filesUpdated} 个文件，开始构建...`, logId);
        await runClientBuild({ installDependencies: true });
      }
    }

    // 更新日志
    const duration = Date.now() - startTime;
    db.prepare(`UPDATE update_logs SET status = 'success', details = ?, files_updated = ?, duration = ? WHERE id = ?`).run(
      `更新完成：${filesUpdated} 个文件，耗时 ${Math.round(duration/1000)}秒`,
      filesUpdated,
      duration,
      logId
    );

    // 获取 PM2 进程名
    const pm2Config = db.prepare("SELECT value FROM site_config WHERE key = 'pm2_process_name'").get();
    const processName = pm2Config?.value || 'userscript-hub';

    res.json({
      code: 200,
      message: `更新完成，共 ${filesUpdated} 个文件，正在重启服务...`,
      data: { logId, filesUpdated }
    });

    // 延迟重启
    setTimeout(async () => {
      try {
        if (IS_DOCKER) {
          triggerDockerRestart();
        } else {
          // 非 Docker：优先尝试 reload (零停机)，失败则 restart
          try {
            console.log(`[更新] 尝试平滑重载进程: ${processName}`);
            await execAsync(`pm2 reload ${processName}`);
            console.log(`[更新] PM2 进程 ${processName} 已重载`);
          } catch (reloadErr) {
            console.warn('[更新] reload 失败，尝试 restart:', reloadErr.message);
            await execAsync(`pm2 restart ${processName}`);
            console.log(`[更新] PM2 进程 ${processName} 已重启`);
          }
        }
      } catch (e) {
        if (!IS_DOCKER) {
          // 最后的兜底
          try { await execAsync('pm2 reload all'); } catch(e2) {
             try { await execAsync('pm2 restart all'); } catch(e3) {}
          }
        }
      }
    }, 1000);

  } catch (e) {
    console.error('一键更新失败:', e);
    if (logId) {
      db.prepare(`UPDATE update_logs SET status = 'failed', details = ? WHERE id = ?`).run(e.message, logId);
    }
    res.status(500).json({ code: 500, message: '更新失败: ' + e.message });
  }
});

// 获取更新日志
router.get('/logs', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) as count FROM update_logs').get().count;
    const logs = db.prepare('SELECT * FROM update_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

    res.json({ code: 200, data: { list: logs, total } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 回滚到备份
router.post('/rollback', auth, async (req, res) => {
  try {
    const { backupName } = req.body;
    if (!backupName) {
      return res.status(400).json({ code: 400, message: '请指定备份名称' });
    }

    const backupDir = path.join(UPLOAD_DIR, backupName);
    if (!fs.existsSync(backupDir)) {
      return res.status(404).json({ code: 404, message: '备份不存在' });
    }

    // 恢复备份
    for (const item of getBackupItems()) {
      const srcPath = path.join(backupDir, item.backupPath);
      if (fs.existsSync(srcPath)) {
        removePathSync(item.sourcePath);
        copyPathSync(srcPath, item.sourcePath);
      }
    }

    // 记录日志
    db.prepare(`INSERT INTO update_logs (status, details) VALUES ('rollback', ?)`).run(`已回滚到备份: ${backupName}`);

    res.json({ code: 200, message: '回滚成功，请手动重启服务或点击重启按钮' });
  } catch (e) {
    console.error('回滚失败:', e);
    res.status(500).json({ code: 500, message: '回滚失败: ' + e.message });
  }
});

// 删除备份
router.delete('/backups/:name', auth, (req, res) => {
  try {
    const backupName = req.params.name;
    if (!backupName) {
      return res.status(400).json({ code: 400, message: '请指定备份名称' });
    }

    // 安全检查：只能删除 backup_ 开头的目录
    if (!backupName.startsWith('backup_') || backupName.includes('..') || backupName.includes('/')) {
      return res.status(403).json({ code: 403, message: '非法操作' });
    }

    const backupDir = path.join(UPLOAD_DIR, backupName);
    if (!fs.existsSync(backupDir)) {
      return res.status(404).json({ code: 404, message: '备份不存在' });
    }

    fs.rmSync(backupDir, { recursive: true, force: true });
    res.json({ code: 200, message: '备份已删除' });
  } catch (e) {
    console.error('删除备份失败:', e);
    res.status(500).json({ code: 500, message: '删除失败: ' + e.message });
  }
});

// 获取备份列表
router.get('/backups', auth, (req, res) => {
  try {
    const backups = [];
    if (fs.existsSync(UPLOAD_DIR)) {
      const files = fs.readdirSync(UPLOAD_DIR);
      for (const file of files) {
        if (file.startsWith('backup_')) {
          const stat = fs.statSync(path.join(UPLOAD_DIR, file));
          backups.push({
            name: file,
            createdAt: stat.mtime.getTime() // 传时间戳，防止前端解析失败
          });
        }
      }
    }
    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ code: 200, data: backups });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 辅助函数：递归复制目录
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyPathSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDirSync(src, dest);
    return;
  }

  const parentDir = path.dirname(dest);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function removePathSync(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }
}

function getBackupItems() {
  if (IS_DOCKER) {
    return [
      { backupPath: 'app/src', sourcePath: path.join(RUNTIME_ROOT, 'src') },
      { backupPath: 'app/public', sourcePath: path.join(RUNTIME_ROOT, 'public') },
      { backupPath: 'app/package.json', sourcePath: path.join(RUNTIME_ROOT, 'package.json') }
    ];
  }

  return [
    { backupPath: 'server/src', sourcePath: path.join(PROJECT_ROOT, 'server/src') },
    { backupPath: 'server/package.json', sourcePath: path.join(PROJECT_ROOT, 'server/package.json') },
    { backupPath: 'client/src', sourcePath: path.join(PROJECT_ROOT, 'client/src') },
    { backupPath: 'client/dist', sourcePath: path.join(PROJECT_ROOT, 'client/dist') },
    { backupPath: 'client/package.json', sourcePath: path.join(PROJECT_ROOT, 'client/package.json') }
  ];
}

function resolveUpdateTargetPath(entryName) {
  if (!IS_DOCKER) {
    return path.join(PROJECT_ROOT, entryName);
  }

  if (entryName.startsWith('server/src/')) {
    return path.join(RUNTIME_ROOT, 'src', entryName.slice('server/src/'.length));
  }

  if (entryName === 'server/package.json') {
    return path.join(RUNTIME_ROOT, 'package.json');
  }

  if (entryName.startsWith('client/dist/')) {
    return path.join(PUBLIC_DIR, entryName.slice('client/dist/'.length));
  }

  return null;
}

function triggerDockerRestart() {
  console.log('[更新] Docker 环境准备自重启，等待容器按 restart policy 拉起');

  setTimeout(() => {
    process.exit(0);
  }, 200);
}

module.exports = router;
