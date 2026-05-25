const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../models/database');
const { authMiddleware: auth } = require('../middleware/auth');
const config = require('../config');
const { normalizeScriptDeliveryConfig } = require('../utils/scriptDelivery');

const RUNTIME_SYNC_CONFIG_KEYS = [
  'runtime_base_url',
  'runtime_manifest_url',
  'runtime_fallback_urls',
  'runtime_heartbeat_interval',
  'runtime_offline_grace_minutes'
];

// ==================== 本机 API 密钥管理 ====================

// 获取或生成本机 API 密钥（供其他节点连接用）
router.get('/api-key', auth, (req, res) => {
  try {
    let apiKey = db.prepare("SELECT value FROM site_config WHERE key = 'sync_api_key'").get();
    if (!apiKey) {
      const key = crypto.randomBytes(32).toString('hex');
      db.prepare("INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES ('sync_api_key', ?, CURRENT_TIMESTAMP)").run(key);
      apiKey = { value: key };
    }
    res.json({ code: 200, data: { apiKey: apiKey.value } });
  } catch (e) {
    console.error('获取API密钥失败:', e);
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 重新生成 API 密钥
router.post('/api-key/regenerate', auth, (req, res) => {
  try {
    const key = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES ('sync_api_key', ?, CURRENT_TIMESTAMP)").run(key);
    res.json({ code: 200, data: { apiKey: key } });
  } catch (e) {
    console.error('重新生成API密钥失败:', e);
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ==================== 节点管理（需要管理员登录） ====================

// 获取所有同步节点
router.get('/nodes', auth, (req, res) => {
  try {
    const nodes = db.prepare('SELECT * FROM sync_nodes ORDER BY created_at DESC').all();
    res.json({ code: 200, data: nodes });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 添加同步节点
router.post('/nodes', auth, (req, res) => {
  try {
    const { name, url, api_key, direction, sync_interval, enabled } = req.body;
    if (!name || !url || !api_key) {
      return res.status(400).json({ code: 400, message: '名称、地址和API密钥不能为空' });
    }
    // 去掉末尾斜杠
    const cleanUrl = url.replace(/\/+$/, '');
    const result = db.prepare(
      'INSERT INTO sync_nodes (name, url, api_key, direction, sync_interval, enabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, cleanUrl, api_key, direction || 'pull', sync_interval || 30, enabled !== undefined ? enabled : 1);
    res.json({ code: 200, data: { id: result.lastInsertRowid }, message: '添加成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 更新同步节点
router.put('/nodes/:id', auth, (req, res) => {
  try {
    const { name, url, api_key, direction, sync_interval, enabled } = req.body;
    const cleanUrl = url ? url.replace(/\/+$/, '') : '';
    db.prepare(
      'UPDATE sync_nodes SET name=?, url=?, api_key=?, direction=?, sync_interval=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(name, cleanUrl, api_key, direction, sync_interval, enabled, req.params.id);
    res.json({ code: 200, message: '更新成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除同步节点
router.delete('/nodes/:id', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM sync_nodes WHERE id = ?').run(req.params.id);
    res.json({ code: 200, message: '删除成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取同步日志
router.get('/logs', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const total = db.prepare('SELECT COUNT(*) as count FROM sync_logs').get().count;
    const logs = db.prepare('SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    res.json({ code: 200, data: { list: logs, total } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 测试节点连接
router.post('/nodes/:id/test', auth, async (req, res) => {
  try {
    const node = db.prepare('SELECT * FROM sync_nodes WHERE id = ?').get(req.params.id);
    if (!node) return res.status(404).json({ code: 404, message: '节点不存在' });

    const response = await fetch(`${node.url}/api/sync/ping`, {
      method: 'GET',
      headers: { 'X-Sync-Key': node.api_key },
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (data.code === 200) {
      res.json({ code: 200, message: '连接成功', data: data.data });
    } else {
      res.json({ code: 400, message: data.message || '连接失败' });
    }
  } catch (e) {
    res.json({ code: 400, message: '连接失败: ' + e.message });
  }
});

// ==================== 对外暴露的同步接口（API密钥验证） ====================

// API 密钥验证中间件
const syncAuth = (req, res, next) => {
  const apiKey = req.headers['x-sync-key'];
  if (!apiKey) {
    return res.status(401).json({ code: 401, message: '缺少同步密钥' });
  }
  const stored = db.prepare("SELECT value FROM site_config WHERE key = 'sync_api_key'").get();
  if (!stored || stored.value !== apiKey) {
    return res.status(403).json({ code: 403, message: '同步密钥无效' });
  }
  next();
};

// Ping - 测试连通性
router.get('/ping', syncAuth, (req, res) => {
  const stats = {
    categories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
    scripts: db.prepare('SELECT COUNT(*) as c FROM scripts').get().c,
    plugins: db.prepare('SELECT COUNT(*) as c FROM plugins').get().c,
    programs: db.prepare('SELECT COUNT(*) as c FROM programs').get().c,
    remoteCoreScripts: db.prepare("SELECT COUNT(*) as c FROM scripts WHERE release_mode = 'remote_core'").get().c
  };
  res.json({ code: 200, data: { status: 'ok', ...stats } });
});

// 拉取数据 - 返回指定时间之后的增量数据
router.get('/pull', syncAuth, (req, res) => {
  try {
    const since = req.query.since || '1970-01-01T00:00:00.000Z';

    // 分类
    const categories = db.prepare('SELECT * FROM categories WHERE created_at > ?').all(since);

    // 脚本
    const scripts = db.prepare('SELECT * FROM scripts WHERE updated_at > ?').all(since);

    // 脚本版本
    const versions = db.prepare('SELECT * FROM script_versions WHERE created_at > ?').all(since);

    // 插件
    const plugins = db.prepare('SELECT * FROM plugins WHERE created_at > ?').all(since);

    // 程序
    const programs = db.prepare('SELECT * FROM programs WHERE updated_at > ?').all(since);

    // 运行时配置
    const runtimeConfigs = db.prepare(`
      SELECT * FROM site_config
      WHERE key IN (${RUNTIME_SYNC_CONFIG_KEYS.map(() => '?').join(', ')})
        AND updated_at > ?
    `).all(...RUNTIME_SYNC_CONFIG_KEYS, since);

    // 远程核心 Manifest
    const remoteManifests = db.prepare('SELECT * FROM script_remote_manifests WHERE updated_at > ?').all(since);

    // 远程核心模块
    const remoteModules = db.prepare('SELECT * FROM script_remote_modules WHERE updated_at > ?').all(since);

    res.json({
      code: 200,
      data: { categories, scripts, versions, plugins, programs, runtimeConfigs, remoteManifests, remoteModules, timestamp: new Date().toISOString() }
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 拉取文件
router.get('/file', syncAuth, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ code: 400, message: '缺少文件路径' });

    const fullPath = resolveSyncFilePath(filePath);
    if (!fullPath) {
      return res.status(403).json({ code: 403, message: '非法路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }

    res.sendFile(fullPath);
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 按业务标识拉取文件，绕过旧 file_path 错配
router.get('/managed-file', syncAuth, (req, res) => {
  try {
    const { type, name, version, variant, storedPath } = req.query;
    if (!type || !name) {
      return res.status(400).json({ code: 400, message: '缺少类型或名称' });
    }

    const fileInfo = getManagedFileInfo(type, name, version, variant, storedPath);
    if (!fileInfo) {
      return res.status(404).json({ code: 404, message: '未找到对应文件记录' });
    }

    const fullPath = resolveSyncFilePath(fileInfo.storedPath);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ code: 404, message: '源文件不存在' });
    }

    res.setHeader('X-Source-Filename', encodeURIComponent(path.basename(fullPath)));
    res.sendFile(fullPath);
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

function getManagedFileInfo(type, name, version, variant, storedPath) {
  if (type === 'script') {
    const script = db.prepare('SELECT * FROM scripts WHERE name = ?').get(name);
    if (!script) {
      return null;
    }

    const versionData = findScriptVersionRecord(script.id, version, storedPath)
      || db.prepare('SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1').get(script.id);

    if (!versionData) {
      return null;
    }

    const useObfuscated = variant === 'obfuscated' && script.enable_obfuscation && versionData.obfuscated_file_path;
    return {
      storedPath: useObfuscated ? versionData.obfuscated_file_path : versionData.file_path
    };
  }

  if (type === 'plugin') {
    const plugin = findVersionedRecord('plugins', name, version, storedPath)
      || db.prepare('SELECT * FROM plugins WHERE name = ? ORDER BY created_at DESC LIMIT 1').get(name);
    return plugin ? { storedPath: plugin.file_path } : null;
  }

  if (type === 'program') {
    const program = findVersionedRecord('programs', name, version, storedPath)
      || db.prepare('SELECT * FROM programs WHERE name = ? ORDER BY created_at DESC LIMIT 1').get(name);
    return program ? { storedPath: program.file_path } : null;
  }

  return null;
}

function findScriptVersionRecord(scriptId, version, storedPath) {
  if (!version && !storedPath) {
    return null;
  }

  const records = db.prepare('SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC').all(scriptId);
  if (!records.length) {
    return null;
  }

  const matchedByVersion = matchRecordByVersion(records, version, 'version');
  if (matchedByVersion) {
    return matchedByVersion;
  }

  return matchScriptVersionByStoredPath(records, storedPath);
}

function findVersionedRecord(table, name, version, storedPath) {
  const records = db.prepare(`SELECT * FROM ${table} WHERE name = ? ORDER BY created_at DESC`).all(name);
  if (!records.length) {
    return null;
  }

  const matchedByVersion = matchRecordByVersion(records, version, 'version');
  if (matchedByVersion) {
    return matchedByVersion;
  }

  return matchRecordByStoredPath(records, storedPath, 'file_path');
}

function matchRecordByVersion(records, version, field) {
  if (!version) {
    return null;
  }

  const normalizedTarget = normalizeVersionValue(version);
  return records.find(record => normalizeVersionValue(record[field]) === normalizedTarget) || null;
}

function matchScriptVersionByStoredPath(records, storedPath) {
  if (!storedPath) {
    return null;
  }

  const targetFileName = path.basename(String(storedPath).replace(/\\/g, '/').split('?')[0].split('#')[0]);
  return records.find(record => {
    const rawCandidates = [record.file_path, record.obfuscated_file_path].filter(Boolean);
    return rawCandidates.some(candidate => path.basename(String(candidate).replace(/\\/g, '/').split('?')[0].split('#')[0]) === targetFileName);
  }) || null;
}

function matchRecordByStoredPath(records, storedPath, field) {
  if (!storedPath) {
    return null;
  }

  const targetFileName = path.basename(String(storedPath).replace(/\\/g, '/').split('?')[0].split('#')[0]);
  return records.find(record => {
    const candidate = record[field];
    if (!candidate) return false;
    return path.basename(String(candidate).replace(/\\/g, '/').split('?')[0].split('#')[0]) === targetFileName;
  }) || null;
}

function normalizeVersionValue(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

function resolveSyncFilePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/').trim();
  if (!normalized) {
    return null;
  }

  const uploadsRoot = path.resolve(config.uploadPath);
  const sanitized = normalized.split('?')[0].split('#')[0];
  const relativePath = sanitized.replace(/^\.\//, '').replace(/^uploads\//, '');
  const candidates = [];

  if (path.isAbsolute(sanitized)) {
    candidates.push(path.resolve(sanitized));
  }

  candidates.push(path.resolve(uploadsRoot, relativePath));

  const matchedDir = sanitized.match(/(?:^|\/)(scripts|plugins|programs|logos|runtime-modules)(?:\/|$)/);
  const fileName = path.basename(sanitized);
  if (matchedDir?.[1] && fileName) {
    candidates.push(path.resolve(uploadsRoot, matchedDir[1], fileName));
  }

  const safeCandidate = [...new Set(candidates)].find(candidate => {
    if (!candidate) return false;
    const normalizedCandidate = candidate.replace(/\\/g, '/');
    return candidate.startsWith(uploadsRoot) || /\/uploads\/(scripts|plugins|programs|logos|runtime-modules)\//.test(normalizedCandidate);
  });

  if (!safeCandidate) {
    return null;
  }

  if (!fs.existsSync(safeCandidate)) {
    return null;
  }

  return safeCandidate;
}

// ==================== 手动触发同步 ====================

router.post('/nodes/:id/sync', auth, async (req, res) => {
  try {
    const node = db.prepare('SELECT * FROM sync_nodes WHERE id = ?').get(req.params.id);
    if (!node) return res.status(404).json({ code: 404, message: '节点不存在' });

    const result = await executeSyncFromNode(node, { forceFull: req.body?.forceFull === true });
    res.json({ code: 200, data: result, message: '同步完成' });
  } catch (e) {
    console.error('手动同步失败:', e);
    res.status(500).json({ code: 500, message: '同步失败: ' + e.message });
  }
});

// ==================== 同步执行逻辑 ====================

async function executeSyncFromNode(node, options = {}) {
  const startTime = Date.now();
  const stats = {
    categories_synced: 0,
    scripts_synced: 0,
    versions_synced: 0,
    plugins_synced: 0,
    programs_synced: 0,
    files_synced: 0,
    runtime_settings_synced: 0,
    remote_manifests_synced: 0,
    remote_modules_synced: 0
  };
  const since = options.forceFull ? '1970-01-01T00:00:00.000Z' : (node.last_sync_at || '');

  try {
    // 拉取远程数据
    const response = await fetch(`${node.url}/api/sync/pull?since=${since}`, {
      headers: { 'X-Sync-Key': node.api_key },
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) throw new Error(`远程返回 ${response.status}`);
    const { data } = await response.json();

    // 同步分类
    for (const cat of data.categories) {
      const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat.name);
      if (!existing) {
        db.prepare('INSERT INTO categories (name, description, sort_order, created_at) VALUES (?, ?, ?, ?)').run(
          cat.name, cat.description, cat.sort_order, cat.created_at
        );
        stats.categories_synced++;
      }
    }

    // 同步脚本
    for (const script of data.scripts) {
      const existing = db.prepare('SELECT id, updated_at FROM scripts WHERE name = ?').get(script.name);
      const delivery = normalizeScriptDeliveryConfig(script, existing || {});
      if (!existing) {
        // 查找对应分类
        let categoryId = null;
        if (script.category_id) {
          const remoteCat = data.categories.find(c => c.id === script.category_id);
          if (remoteCat) {
            const localCat = db.prepare('SELECT id FROM categories WHERE name = ?').get(remoteCat.name);
            if (localCat) categoryId = localCat.id;
          }
        }
        db.prepare(`INSERT INTO scripts (name, description, category_id, current_version, is_private, show_in_list, access_password, enable_obfuscation, release_mode, auth_mode, runtime_enabled, allow_device_binding, binding_strategy, default_device_limit, usage_tracking_enabled, download_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          script.name, script.description, categoryId, script.current_version,
          script.is_private, script.show_in_list, script.access_password,
          delivery.enable_obfuscation ? 1 : 0, delivery.release_mode, delivery.auth_mode,
          delivery.runtime_enabled ? 1 : 0, delivery.allow_device_binding ? 1 : 0, delivery.binding_strategy, delivery.default_device_limit,
          delivery.usage_tracking_enabled ? 1 : 0, script.download_count, script.created_at, script.updated_at
        );
        stats.scripts_synced++;
      } else if (new Date(script.updated_at) > new Date(existing.updated_at)) {
        // 更新已有脚本
        let categoryId = null;
        if (script.category_id) {
          const remoteCat = data.categories.find(c => c.id === script.category_id);
          if (remoteCat) {
            const localCat = db.prepare('SELECT id FROM categories WHERE name = ?').get(remoteCat.name);
            if (localCat) categoryId = localCat.id;
          }
        }
        db.prepare(`UPDATE scripts SET description=?, category_id=?, current_version=?, is_private=?, show_in_list=?, access_password=?, enable_obfuscation=?, release_mode=?, auth_mode=?, runtime_enabled=?, allow_device_binding=?, binding_strategy=?, default_device_limit=?, usage_tracking_enabled=?, download_count=MAX(download_count,?), updated_at=? WHERE id=?`).run(
          script.description, categoryId, script.current_version,
          script.is_private, script.show_in_list, script.access_password,
          delivery.enable_obfuscation ? 1 : 0, delivery.release_mode,
          delivery.auth_mode, delivery.runtime_enabled ? 1 : 0,
          delivery.allow_device_binding ? 1 : 0, delivery.binding_strategy, delivery.default_device_limit,
          delivery.usage_tracking_enabled ? 1 : 0, script.download_count, script.updated_at, existing.id
        );
        stats.scripts_synced++;
      }
    }

    // 同步脚本版本和文件
    for (const ver of data.versions) {
      // 找到远程脚本名
      const remoteScript = data.scripts.find(s => s.id === ver.script_id);
      if (!remoteScript) continue;

      const localScript = db.prepare('SELECT id FROM scripts WHERE name = ?').get(remoteScript.name);
      if (!localScript) continue;

      // 检查版本是否已存在
      const existingVer = db.prepare('SELECT * FROM script_versions WHERE script_id = ? AND version = ?').get(localScript.id, ver.version);
      if (existingVer) {
        const nextFilePath = await ensureLocalFile(node, ver.file_path, 'scripts', existingVer.file_path, stats);
        const nextObfuscatedPath = await ensureLocalFile(node, ver.obfuscated_file_path, 'scripts', existingVer.obfuscated_file_path, stats);

        if (nextFilePath !== existingVer.file_path || nextObfuscatedPath !== existingVer.obfuscated_file_path) {
          db.prepare('UPDATE script_versions SET file_path = ?, obfuscated_file_path = ?, file_size = ? WHERE id = ?').run(
            nextFilePath,
            nextObfuscatedPath,
            ver.file_size,
            existingVer.id
          );
        }
        continue;
      }

      // 下载脚本文件
      let localFilePath = ver.file_path;
      if (ver.file_path) {
        const downloaded = await downloadFile(node, ver.file_path, 'scripts');
        if (downloaded) {
          localFilePath = downloaded;
          stats.files_synced++;
        }
      }

      // 下载混淆文件
      let localObfuscatedPath = ver.obfuscated_file_path;
      if (ver.obfuscated_file_path) {
        const downloaded = await downloadFile(node, ver.obfuscated_file_path, 'scripts');
        if (downloaded) {
          localObfuscatedPath = downloaded;
          stats.files_synced++;
        }
      }

      db.prepare(`INSERT INTO script_versions (script_id, version, changelog, file_path, obfuscated_file_path, file_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        localScript.id, ver.version, ver.changelog, localFilePath, localObfuscatedPath, ver.file_size, ver.created_at
      );
      stats.versions_synced++;
    }

    // 同步运行时设置
    for (const configItem of (data.runtimeConfigs || [])) {
      db.prepare('INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES (?, ?, ?)').run(
        configItem.key,
        configItem.value,
        configItem.updated_at || new Date().toISOString()
      );
      stats.runtime_settings_synced++;
    }

    // 同步远程核心 Manifest
    for (const manifest of (data.remoteManifests || [])) {
      const remoteScript = data.scripts.find(item => item.id === manifest.script_id);
      if (!remoteScript) continue;

      const localScript = db.prepare('SELECT id FROM scripts WHERE name = ?').get(remoteScript.name);
      if (!localScript) continue;

      const existingManifest = db.prepare('SELECT * FROM script_remote_manifests WHERE script_id = ? AND version = ?').get(localScript.id, manifest.version);
      if (existingManifest) {
        if (new Date(manifest.updated_at) <= new Date(existingManifest.updated_at)) {
          continue;
        }

        db.prepare(`
          UPDATE script_remote_manifests
          SET status = ?, manifest_json = ?, remote_config_json = ?, active_module_version = ?, description = ?, published_at = ?, created_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          manifest.status || existingManifest.status,
          manifest.manifest_json,
          manifest.remote_config_json,
          manifest.active_module_version || null,
          manifest.description || '',
          manifest.published_at || null,
          manifest.created_at || existingManifest.created_at,
          manifest.updated_at,
          existingManifest.id
        );
      } else {
        db.prepare(`
          INSERT INTO script_remote_manifests (
            script_id, version, status, manifest_json, remote_config_json, active_module_version, description, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          localScript.id,
          manifest.version,
          manifest.status || 'draft',
          manifest.manifest_json,
          manifest.remote_config_json,
          manifest.active_module_version || null,
          manifest.description || '',
          manifest.published_at || null,
          manifest.created_at,
          manifest.updated_at
        );
      }

      stats.remote_manifests_synced++;
    }

    // 同步远程核心模块和代码文件
    for (const moduleRecord of (data.remoteModules || [])) {
      const remoteScript = data.scripts.find(item => item.id === moduleRecord.script_id);
      if (!remoteScript) continue;

      const localScript = db.prepare('SELECT id FROM scripts WHERE name = ?').get(remoteScript.name);
      if (!localScript) continue;

      const existingModule = db.prepare('SELECT * FROM script_remote_modules WHERE script_id = ? AND version = ?').get(localScript.id, moduleRecord.version);
      const nextFilePath = await ensureLocalFile(
        node,
        moduleRecord.file_path,
        path.join('runtime-modules', String(localScript.id)),
        existingModule?.file_path,
        stats
      );

      if (existingModule) {
        if (new Date(moduleRecord.updated_at) <= new Date(existingModule.updated_at) && nextFilePath === existingModule.file_path) {
          continue;
        }

        db.prepare(`
          UPDATE script_remote_modules
          SET module_name = ?, description = ?, entry_name = ?, file_path = ?, status = ?, published_at = ?, created_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          moduleRecord.module_name || existingModule.module_name,
          moduleRecord.description || '',
          moduleRecord.entry_name || 'bootstrap',
          nextFilePath || existingModule.file_path,
          moduleRecord.status || existingModule.status,
          moduleRecord.published_at || null,
          moduleRecord.created_at || existingModule.created_at,
          moduleRecord.updated_at,
          existingModule.id
        );
      } else {
        db.prepare(`
          INSERT INTO script_remote_modules (
            script_id, version, module_name, description, entry_name, file_path, status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          localScript.id,
          moduleRecord.version,
          moduleRecord.module_name,
          moduleRecord.description || '',
          moduleRecord.entry_name || 'bootstrap',
          nextFilePath || moduleRecord.file_path,
          moduleRecord.status || 'draft',
          moduleRecord.published_at || null,
          moduleRecord.created_at,
          moduleRecord.updated_at
        );
      }

      stats.remote_modules_synced++;
    }

    // 同步插件
    for (const plugin of data.plugins) {
      const existing = db.prepare('SELECT * FROM plugins WHERE name = ? AND version = ?').get(plugin.name, plugin.version);
      if (existing) {
        const nextPluginPath = await ensureLocalFile(node, plugin.file_path, 'plugins', existing.file_path, stats);
        if (nextPluginPath !== existing.file_path) {
          db.prepare('UPDATE plugins SET file_path = ?, file_size = ? WHERE id = ?').run(nextPluginPath, plugin.file_size, existing.id);
        }
        continue;
      }

      // 下载插件文件
      let localPluginPath = plugin.file_path;
      if (plugin.file_path) {
        const downloaded = await downloadFile(node, plugin.file_path, 'plugins');
        if (downloaded) {
          localPluginPath = downloaded;
          stats.files_synced++;
        }
      }

      db.prepare(`INSERT INTO plugins (name, description, version, browser_type, file_path, file_size, is_recommended, download_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        plugin.name, plugin.description, plugin.version, plugin.browser_type,
        localPluginPath, plugin.file_size, plugin.is_recommended, plugin.download_count, plugin.created_at
      );
      stats.plugins_synced++;
    }

    // 同步程序
    for (const program of data.programs) {
      const existing = db.prepare('SELECT * FROM programs WHERE name = ? AND version = ?').get(program.name, program.version);
      if (existing) {
        const nextProgramPath = await ensureLocalFile(node, program.file_path, 'programs', existing.file_path, stats);
        if (nextProgramPath !== existing.file_path) {
          db.prepare('UPDATE programs SET file_path = ?, file_size = ?, updated_at = ? WHERE id = ?').run(
            nextProgramPath,
            program.file_size,
            program.updated_at,
            existing.id
          );
        }
        continue;
      }

      // 下载程序文件
      let localProgramPath = program.file_path;
      if (program.file_path) {
        const downloaded = await downloadFile(node, program.file_path, 'programs');
        if (downloaded) {
          localProgramPath = downloaded;
          stats.files_synced++;
        }
      }

      db.prepare(`INSERT INTO programs (name, description, version, file_path, file_size, is_recommended, download_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        program.name, program.description, program.version,
        localProgramPath, program.file_size, program.is_recommended, program.download_count, 
        program.created_at, program.updated_at
      );
      stats.programs_synced++;
    }

    const summaryText = buildSyncSummaryText(stats);

    // 更新最后同步时间
    db.prepare('UPDATE sync_nodes SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?').run(node.id);

    // 记录日志
    const duration = Date.now() - startTime;
    db.prepare(`INSERT INTO sync_logs (node_id, node_name, direction, status, details, categories_synced, scripts_synced, versions_synced, plugins_synced, programs_synced, files_synced, duration)
      VALUES (?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      node.id, node.name, node.direction,
      summaryText,
      stats.categories_synced, stats.scripts_synced, stats.versions_synced, stats.plugins_synced, stats.programs_synced, stats.files_synced, duration
    );

    return stats;
  } catch (e) {
    const duration = Date.now() - startTime;
    db.prepare(`INSERT INTO sync_logs (node_id, node_name, direction, status, details, duration)
      VALUES (?, ?, ?, 'failed', ?, ?)`).run(node.id, node.name, node.direction, e.message, duration);
    throw e;
  }
}

// 下载远程文件到本地
async function downloadFile(node, filePath, fallbackDir) {
  try {
    const response = await fetch(`${node.url}/api/sync/file?path=${encodeURIComponent(filePath)}`, {
      headers: { 'X-Sync-Key': node.api_key },
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) return null;

    const localStoredPath = buildLocalStoredPath(filePath, fallbackDir);
    const localPath = path.resolve(config.uploadPath, localStoredPath);
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localStoredPath.replace(/\\/g, '/');
  } catch (e) {
    console.error(`下载文件失败 ${filePath}:`, e.message);
    return null;
  }
}

async function ensureLocalFile(node, remoteFilePath, fallbackDir, currentStoredPath, stats) {
  if (!remoteFilePath) {
    return currentStoredPath || null;
  }

  if (currentStoredPath && hasLocalStoredFile(currentStoredPath, fallbackDir)) {
    return currentStoredPath;
  }

  const downloaded = await downloadFile(node, remoteFilePath, fallbackDir);
  if (downloaded) {
    stats.files_synced++;
    return downloaded;
  }

  return currentStoredPath || remoteFilePath;
}

function hasLocalStoredFile(storedPath, fallbackDir) {
  if (!storedPath) {
    return false;
  }

  const normalized = String(storedPath).replace(/\\/g, '/').trim();
  if (!normalized) {
    return false;
  }

  const relativePath = normalized.replace(/^\.\//, '').replace(/^uploads\//, '');
  const candidates = [];

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  }

  candidates.push(path.resolve(config.uploadPath, relativePath));

  const matchedDir = normalized.match(/(?:^|\/)(scripts|plugins|programs|logos|runtime-modules(?:\/\d+)?)(?:\/|$)/);
  const subdir = matchedDir?.[1] || fallbackDir;
  const fileName = path.basename(normalized.split('?')[0].split('#')[0]);

  if (subdir && fileName) {
    candidates.push(path.resolve(config.uploadPath, subdir, fileName));
  }

  return [...new Set(candidates)].some(candidate => candidate && fs.existsSync(candidate));
}

function buildLocalStoredPath(filePath, fallbackDir) {
  const normalized = String(filePath).replace(/\\/g, '/').trim();
  const matchedDir = normalized.match(/(?:^|\/)(scripts|plugins|programs|logos|runtime-modules(?:\/\d+)?)(?:\/|$)/);
  const subdir = matchedDir?.[1] || fallbackDir || '';
  const fileName = path.basename(normalized);

  if (subdir) {
    return path.join(subdir, fileName);
  }

  return fileName;
}

function buildSyncSummaryText(stats) {
  const parts = [
    `${stats.categories_synced} 分类`,
    `${stats.scripts_synced} 脚本`,
    `${stats.versions_synced} 版本`,
    `${stats.plugins_synced} 插件`,
    `${stats.programs_synced} 小程序`,
    `${stats.files_synced} 文件`
  ];

  if (stats.runtime_settings_synced) {
    parts.push(`${stats.runtime_settings_synced} 运行设置`);
  }
  if (stats.remote_manifests_synced) {
    parts.push(`${stats.remote_manifests_synced} 远程版本`);
  }
  if (stats.remote_modules_synced) {
    parts.push(`${stats.remote_modules_synced} 远程模块`);
  }

  return `同步完成：${parts.join(' / ')}`;
}

// ==================== 定时同步 ====================

function startSyncScheduler() {
  // 启动后 10 秒立即执行一次全量同步
  setTimeout(() => {
    try {
      const nodes = db.prepare('SELECT * FROM sync_nodes WHERE enabled = 1').all();
      for (const node of nodes) {
        console.log(`[启动同步] 开始同步节点: ${node.name}`);
        executeSyncFromNode(node).then(stats => {
          console.log(`[启动同步] ${node.name} 完成:`, stats);
        }).catch(e => {
          console.error(`[启动同步] ${node.name} 失败:`, e.message);
        });
      }
    } catch (e) {
      console.error('[启动同步] 失败:', e.message);
    }
  }, 10 * 1000);

  // 每分钟检查一次是否有节点需要同步
  setInterval(() => {
    try {
      const nodes = db.prepare('SELECT * FROM sync_nodes WHERE enabled = 1').all();
      const now = new Date();

      for (const node of nodes) {
        const lastSync = node.last_sync_at ? new Date(node.last_sync_at) : new Date(0);
        const intervalMs = (node.sync_interval || 30) * 60 * 1000;

        if (now - lastSync >= intervalMs) {
          console.log(`[定时同步] 开始同步节点: ${node.name}`);
          executeSyncFromNode(node).then(stats => {
            console.log(`[定时同步] ${node.name} 完成:`, stats);
          }).catch(e => {
            console.error(`[定时同步] ${node.name} 失败:`, e.message);
          });
        }
      }
    } catch (e) {
      console.error('[定时同步] 检查失败:', e.message);
    }
  }, 60 * 1000);

  console.log('同步调度器已启动（启动后10秒执行首次同步）');
}

// 启动调度器
startSyncScheduler();

module.exports = router;
