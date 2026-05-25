const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const db = require('../models/database');
const { authMiddleware: auth } = require('../middleware/auth');
const config = require('../config');
const jwt = require('jsonwebtoken');

const exportJobs = new Map();

function authWithQuery(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token;

  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (tokenFromQuery) {
    token = tokenFromQuery;
  }

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

// 配置 multer 用于接收备份文件
const upload = multer({
  dest: path.join(config.uploadPath, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// 创建导出任务
router.post('/export/jobs', auth, async (req, res) => {
  try {
    const job = await createExportJob();
    res.json({ code: 200, message: '导出任务已创建', data: { jobId: job.id } });
  } catch (error) {
    console.error('创建导出任务失败:', error);
    res.status(500).json({ code: 500, message: '导出失败: ' + error.message });
  }
});

// 获取导出任务状态
router.get('/export/jobs/:jobId', auth, (req, res) => {
  const job = exportJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ code: 404, message: '导出任务不存在或已过期' });
  }

  res.json({
    code: 200,
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      fileName: job.fileName,
      downloadUrl: job.status === 'completed' ? `/api/backup/export/jobs/${job.id}/download` : null
    }
  });
});

// 下载导出文件
router.get('/export/jobs/:jobId/download', authWithQuery, (req, res) => {
  const job = exportJobs.get(req.params.jobId);
  if (!job || job.status !== 'completed' || !job.zipFilePath || !fs.existsSync(job.zipFilePath)) {
    return res.status(404).json({ code: 404, message: '导出文件不存在或尚未生成完成' });
  }

  res.download(job.zipFilePath, job.fileName, () => {
    cleanupExportJob(job.id);
  });
});

// 导入数据
router.post('/import', auth, upload.single('file'), async (req, res) => {
  const tempExtractDir = path.join(config.uploadPath, 'temp', `import_${Date.now()}`);

  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传备份文件' });
    }

    const zipPath = req.file.path;

    // 解压文件
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractDir, true);

    // 读取数据文件
    const dataJsonPath = path.join(tempExtractDir, 'data.json');
    if (!fs.existsSync(dataJsonPath)) {
      throw new Error('无效的备份文件：缺少 data.json');
    }

    const importData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf-8'));

    if (!importData.version || !importData.data) {
      throw new Error('无效的备份文件格式');
    }

    // 开始事务导入数据
    const importTransaction = db.transaction(() => {
      // 清空现有数据（保留 admin 表）
      db.exec('DELETE FROM script_runtime_events');
      db.exec('DELETE FROM script_runtime_sessions');
      db.exec('DELETE FROM script_authorization_devices');
      db.exec('DELETE FROM script_auth_requests');
      db.exec('DELETE FROM script_authorizations');
      db.exec('DELETE FROM script_runtime_profiles');
      db.exec('DELETE FROM download_stats');
      db.exec('DELETE FROM script_versions');
      db.exec('DELETE FROM scripts');
      db.exec('DELETE FROM plugins');
      db.exec('DELETE FROM programs');
      db.exec('DELETE FROM categories');
      db.exec('DELETE FROM site_config');

      // 导入分类
      if (importData.data.categories?.length) {
        const insertCategory = db.prepare(
          'INSERT INTO categories (id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
        );
        for (const cat of importData.data.categories) {
          insertCategory.run(cat.id, cat.name, cat.description, cat.sort_order, cat.created_at);
        }
      }

      // 导入脚本
      if (importData.data.scripts?.length) {
        const insertScript = db.prepare(
          `INSERT INTO scripts (id, name, description, category_id, current_version, is_private,
           show_in_list, access_password, enable_obfuscation, release_mode, auth_mode, runtime_enabled,
           allow_device_binding, binding_strategy, default_device_limit, usage_tracking_enabled, download_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const script of importData.data.scripts) {
          insertScript.run(
            script.id, script.name, script.description, script.category_id, script.current_version,
            script.is_private, script.show_in_list, script.access_password, script.enable_obfuscation,
            script.release_mode || 'direct_obfuscated', script.auth_mode || 'none', script.runtime_enabled || 0,
            script.allow_device_binding || 0, script.binding_strategy || 'browser', script.default_device_limit || 1, script.usage_tracking_enabled || 0,
            script.download_count, script.created_at, script.updated_at
          );
        }
      }

      // 导入脚本版本
      if (importData.data.script_versions?.length) {
        const insertVersion = db.prepare(
          `INSERT INTO script_versions (id, script_id, version, changelog, file_path, obfuscated_file_path, loader_file_path, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const ver of importData.data.script_versions) {
          insertVersion.run(
            ver.id, ver.script_id, ver.version, ver.changelog, ver.file_path,
            ver.obfuscated_file_path, ver.loader_file_path || null, ver.file_size, ver.created_at
          );
        }
      }

      if (importData.data.script_runtime_profiles?.length) {
        const insertProfile = db.prepare(
          `INSERT INTO script_runtime_profiles (id, name, runtime_base_url, manifest_url, fallback_urls, heartbeat_interval, offline_grace_minutes, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const profile of importData.data.script_runtime_profiles) {
          insertProfile.run(
            profile.id,
            profile.name,
            profile.runtime_base_url,
            profile.manifest_url,
            profile.fallback_urls,
            profile.heartbeat_interval,
            profile.offline_grace_minutes,
            profile.is_default,
            profile.created_at,
            profile.updated_at
          );
        }
      }

      if (importData.data.script_authorizations?.length) {
        const insertAuth = db.prepare(
          `INSERT INTO script_authorizations (id, script_id, authorization_code, applicant_name, contact, purpose, remark, status, device_limit, allow_rebind, starts_at, expires_at, last_activated_at, last_active_at, approved_by, review_note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const auth of importData.data.script_authorizations) {
          insertAuth.run(
            auth.id,
            auth.script_id,
            auth.authorization_code,
            auth.applicant_name,
            auth.contact,
            auth.purpose,
            auth.remark,
            auth.status,
            auth.device_limit,
            auth.allow_rebind,
            auth.starts_at,
            auth.expires_at,
            auth.last_activated_at,
            auth.last_active_at,
            auth.approved_by,
            auth.review_note,
            auth.created_at,
            auth.updated_at
          );
        }
      }

      if (importData.data.script_auth_requests?.length) {
        const insertRequest = db.prepare(
          `INSERT INTO script_auth_requests (id, script_id, applicant_name, contact, purpose, remark, device_fingerprint, device_label, status, review_note, reviewed_by, reviewed_at, authorization_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const request of importData.data.script_auth_requests) {
          insertRequest.run(
            request.id,
            request.script_id,
            request.applicant_name,
            request.contact,
            request.purpose,
            request.remark,
            request.device_fingerprint,
            request.device_label,
            request.status,
            request.review_note,
            request.reviewed_by,
            request.reviewed_at,
            request.authorization_id,
            request.created_at,
            request.updated_at
          );
        }
      }

      if (importData.data.script_authorization_devices?.length) {
        const insertDevice = db.prepare(
          `INSERT INTO script_authorization_devices (id, authorization_id, script_id, device_fingerprint, device_label, device_meta, status, first_seen_at, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const device of importData.data.script_authorization_devices) {
          insertDevice.run(
            device.id,
            device.authorization_id,
            device.script_id,
            device.device_fingerprint,
            device.device_label,
            device.device_meta,
            device.status,
            device.first_seen_at,
            device.last_seen_at,
            device.created_at,
            device.updated_at
          );
        }
      }

      if (importData.data.script_runtime_sessions?.length) {
        const insertSession = db.prepare(
          `INSERT INTO script_runtime_sessions (id, script_id, authorization_id, device_id, session_token, runtime_version, current_url, started_at, last_heartbeat_at, ended_at, duration_seconds, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const session of importData.data.script_runtime_sessions) {
          insertSession.run(
            session.id,
            session.script_id,
            session.authorization_id,
            session.device_id,
            session.session_token,
            session.runtime_version,
            session.current_url,
            session.started_at,
            session.last_heartbeat_at,
            session.ended_at,
            session.duration_seconds,
            session.status,
            session.created_at,
            session.updated_at
          );
        }
      }

      if (importData.data.script_runtime_events?.length) {
        const insertEvent = db.prepare(
          `INSERT INTO script_runtime_events (id, script_id, authorization_id, device_id, session_id, event_type, event_payload, current_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const event of importData.data.script_runtime_events) {
          insertEvent.run(
            event.id,
            event.script_id,
            event.authorization_id,
            event.device_id,
            event.session_id,
            event.event_type,
            event.event_payload,
            event.current_url,
            event.created_at
          );
        }
      }

      // 导入插件
      if (importData.data.plugins?.length) {
        const insertPlugin = db.prepare(
          `INSERT INTO plugins (id, name, description, version, browser_type, file_path, file_size, is_recommended, download_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const plugin of importData.data.plugins) {
          insertPlugin.run(
            plugin.id, plugin.name, plugin.description, plugin.version, plugin.browser_type,
            plugin.file_path, plugin.file_size, plugin.is_recommended, plugin.download_count, plugin.created_at
          );
        }
      }

      // 导入程序
      if (importData.data.programs?.length) {
        const insertProgram = db.prepare(
          `INSERT INTO programs (id, name, description, version, file_path, file_size, is_recommended, download_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const program of importData.data.programs) {
          insertProgram.run(
            program.id, program.name, program.description, program.version,
            program.file_path, program.file_size, program.is_recommended, program.download_count, 
            program.created_at, program.updated_at
          );
        }
      }

      // 导入网站配置
      if (importData.data.site_config?.length) {
        const insertConfig = db.prepare(
          'INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, ?)'
        );
        for (const cfg of importData.data.site_config) {
          insertConfig.run(cfg.key, cfg.value, cfg.updated_at);
        }
      }

      // 导入下载统计
      if (importData.data.download_stats?.length) {
        const insertStat = db.prepare(
          `INSERT INTO download_stats (id, target_type, target_id, ip_address, user_agent, browser, os, device, country, city, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const stat of importData.data.download_stats) {
          insertStat.run(
            stat.id, stat.target_type, stat.target_id, stat.ip_address, stat.user_agent,
            stat.browser, stat.os, stat.device, stat.country, stat.city, stat.created_at
          );
        }
      }
    });

    importTransaction();

    // 复制上传文件
    const backupUploadsDir = path.join(tempExtractDir, 'uploads');
    const targetUploadsDir = path.resolve(config.uploadPath);

    if (fs.existsSync(backupUploadsDir)) {
      // 清空目标目录（保留 temp）
      const subDirs = ['scripts', 'plugins', 'logos', 'programs'];
      for (const dir of subDirs) {
        const targetDir = path.join(targetUploadsDir, dir);
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      }
      // 复制备份文件
      copyDirSync(backupUploadsDir, targetUploadsDir);
    }

    // 清理临时文件
    fs.unlinkSync(zipPath);
    fs.rmSync(tempExtractDir, { recursive: true, force: true });

    res.json({
      code: 200,
      message: '导入成功',
      data: {
        categories: importData.data.categories?.length || 0,
        scripts: importData.data.scripts?.length || 0,
        plugins: importData.data.plugins?.length || 0,
        programs: importData.data.programs?.length || 0
      }
    });

  } catch (error) {
    console.error('导入失败:', error);
    // 清理临时文件
    try {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch (e) {}
    res.status(500).json({ code: 500, message: '导入失败: ' + error.message });
  }
});

// 获取备份信息（数据统计）
router.get('/info', auth, (req, res) => {
  try {
    const info = {
      categories: db.prepare('SELECT COUNT(*) as count FROM categories').get().count,
      scripts: db.prepare('SELECT COUNT(*) as count FROM scripts').get().count,
      script_versions: db.prepare('SELECT COUNT(*) as count FROM script_versions').get().count,
      authorizations: db.prepare('SELECT COUNT(*) as count FROM script_authorizations').get().count,
      auth_requests: db.prepare('SELECT COUNT(*) as count FROM script_auth_requests').get().count,
      runtime_sessions: db.prepare('SELECT COUNT(*) as count FROM script_runtime_sessions').get().count,
      plugins: db.prepare('SELECT COUNT(*) as count FROM plugins').get().count,
      programs: db.prepare('SELECT COUNT(*) as count FROM programs').get().count,
      download_stats: db.prepare('SELECT COUNT(*) as count FROM download_stats').get().count
    };

    // 计算上传文件大小
    const uploadsDir = path.resolve(config.uploadPath);
    info.uploadSize = getDirSize(uploadsDir);
    info.uploadSizeFormatted = formatSize(info.uploadSize);

    res.json({ code: 200, data: info });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// 辅助函数：递归复制目录
function copyDirSync(src, dest, excludeDirs = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, excludeDirs);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 辅助函数：获取目录大小
function getDirSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return size;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  return size;
}

// 辅助函数：格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

// 辅助函数：格式化日期
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

async function createExportJob() {
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempBaseDir = path.join(config.uploadPath, 'temp');
  const tempDir = path.join(tempBaseDir, `backup_${jobId}`);
  const fileName = `userscript_hub_backup_${formatDate(new Date())}.zip`;
  const zipFilePath = path.join(tempBaseDir, `${jobId}_${fileName}`);

  ensureDir(tempBaseDir);
  ensureDir(tempDir);

  const job = {
    id: jobId,
    status: 'processing',
    progress: 0,
    message: '准备导出任务...',
    tempDir,
    zipFilePath,
    fileName,
    createdAt: Date.now()
  };

  exportJobs.set(jobId, job);

  process.nextTick(async () => {
    try {
      updateExportJob(jobId, 10, '正在读取数据库...');
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        data: {
          categories: db.prepare('SELECT * FROM categories').all(),
          scripts: db.prepare('SELECT * FROM scripts').all(),
          script_versions: db.prepare('SELECT * FROM script_versions').all(),
          script_runtime_profiles: db.prepare('SELECT * FROM script_runtime_profiles').all(),
          script_auth_requests: db.prepare('SELECT * FROM script_auth_requests').all(),
          script_authorizations: db.prepare('SELECT * FROM script_authorizations').all(),
          script_authorization_devices: db.prepare('SELECT * FROM script_authorization_devices').all(),
          script_runtime_sessions: db.prepare('SELECT * FROM script_runtime_sessions').all(),
          script_runtime_events: db.prepare('SELECT * FROM script_runtime_events').all(),
          plugins: db.prepare('SELECT * FROM plugins').all(),
          programs: db.prepare('SELECT * FROM programs').all(),
          site_config: db.prepare('SELECT * FROM site_config').all(),
          download_stats: db.prepare('SELECT * FROM download_stats').all()
        }
      };

      updateExportJob(jobId, 30, '正在写入备份数据...');
      fs.writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify(exportData, null, 2));

      updateExportJob(jobId, 50, '正在整理上传文件...');
      const uploadsDir = path.resolve(config.uploadPath);
      const backupUploadsDir = path.join(tempDir, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        copyDirSync(uploadsDir, backupUploadsDir, ['temp']);
      }

      updateExportJob(jobId, 75, '正在压缩 ZIP 文件...');
      await buildBackupArchive(tempDir, zipFilePath, (progress) => {
        updateExportJob(jobId, 75 + Math.round(progress * 0.2), `正在压缩 ZIP 文件... ${progress}%`);
      });

      const currentJob = exportJobs.get(jobId);
      if (!currentJob) {
        return;
      }

      currentJob.status = 'completed';
      currentJob.progress = 100;
      currentJob.message = '导出完成，可以下载';
    } catch (error) {
      console.error('导出任务失败:', error);
      const currentJob = exportJobs.get(jobId);
      if (currentJob) {
        currentJob.status = 'failed';
        currentJob.message = '导出失败: ' + error.message;
      }
    }
  });

  return job;
}

function updateExportJob(jobId, progress, message) {
  const job = exportJobs.get(jobId);
  if (!job) {
    return;
  }

  job.progress = Math.min(progress, 99);
  job.message = message;
}

function buildBackupArchive(sourceDir, zipFilePath, onProgress) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('progress', (progress) => {
      const total = progress.entries.total || 1;
      const processed = progress.entries.processed || 0;
      onProgress(Math.min(99, Math.round((processed / total) * 100)));
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function cleanupExportJob(jobId) {
  const job = exportJobs.get(jobId);
  if (!job) {
    return;
  }

  try {
    if (job.tempDir) {
      fs.rmSync(job.tempDir, { recursive: true, force: true });
    }
    if (job.zipFilePath && fs.existsSync(job.zipFilePath)) {
      fs.unlinkSync(job.zipFilePath);
    }
  } catch (error) {
    console.error('清理导出任务失败:', error);
  }

  exportJobs.delete(jobId);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of exportJobs.entries()) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      cleanupExportJob(jobId);
    }
  }
}, 5 * 60 * 1000);

module.exports = router;
