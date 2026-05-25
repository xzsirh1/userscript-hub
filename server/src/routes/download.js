const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const JavaScriptObfuscator = require('javascript-obfuscator');
const db = require('../models/database');
const config = require('../config');
const { recordDownload } = require('../controllers/statsController');
const {
  buildVerifiedLoaderScript,
  buildRemoteCoreShellScript,
  collectUserScriptGrants,
  extractUserScriptHeader,
  validateGeneratedWrapperIntegrity
} = require('../utils/runtimeScript');

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((result, item) => {
    const index = item.indexOf('=');
    if (index < 0) return result;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(value);
    }
    return result;
  }, {});
}

function hasScriptAccessCookie(req, scriptId) {
  const cookies = parseCookies(req);
  const token = cookies[`script_access_${scriptId}`];
  if (!token) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return decoded?.type === 'script-access' && Number(decoded.scriptId) === Number(scriptId);
  } catch (error) {
    return false;
  }
}

const UPLOAD_SUBDIRS = {
  script: 'scripts',
  plugin: 'plugins',
  program: 'programs'
};

// 可选验证（支持 header 和 query 参数两种方式）
function optionalAuthWithQuery(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token;

  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (tokenFromQuery) {
    token = tokenFromQuery;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.admin = decoded;
    } catch (error) {
      // Token无效，但不阻止请求
    }
  }

  next();
}

// 获取要下载的文件路径（根据用户身份和混淆设置）
const getDownloadFilePath = (script, versionData, isAdmin, options = {}) => {
  const forceUserPackage = Boolean(options.forceUserPackage);
  // 管理员始终下载原始版本
  if (isAdmin && !forceUserPackage) {
    return versionData.file_path;
  }

  // 非管理员：如果启用了混淆且有混淆文件，返回混淆版本
  if (script.enable_obfuscation && versionData.obfuscated_file_path) {
    return versionData.obfuscated_file_path;
  }

  // 否则返回原始版本
  return versionData.file_path;
};

function ensureObfuscatedScriptFile(script, versionData) {
  if (!script || !versionData || !Number(script.enable_obfuscation)) {
    return versionData?.file_path || null;
  }

  const existingPath = resolveStoredFilePath(versionData.obfuscated_file_path, 'script');
  if (existingPath) {
    try {
      const existingCode = fs.readFileSync(existingPath, 'utf8');
      const { header: existingHeader } = extractUserScriptHeader(existingCode);
      if (existingHeader) {
        return versionData.obfuscated_file_path;
      }
      console.warn('[download] 已检测到旧的坏混淆文件，准备自动重建', {
        versionId: versionData.id,
        obfuscatedPath: versionData.obfuscated_file_path
      });
    } catch (error) {
      console.warn('[download] 读取混淆文件失败，准备自动重建', {
        versionId: versionData.id,
        obfuscatedPath: versionData.obfuscated_file_path,
        error: error.message
      });
    }
  }

  const sourcePath = resolveStoredFilePath(versionData.file_path, 'script');
  if (!sourcePath) {
    return versionData.file_path;
  }

  const sourceCode = fs.readFileSync(sourcePath, 'utf8');
  const { header, body } = extractUserScriptHeader(sourceCode);
  const result = JavaScriptObfuscator.obfuscate(body, {
    compact: true,
    controlFlowFlattening: true,
    deadCodeInjection: false,
    simplify: true,
    stringArray: true,
    stringArrayThreshold: 0.75,
    renameGlobals: false
  });

  const baseName = path.basename(versionData.file_path || sourcePath, path.extname(versionData.file_path || sourcePath));
  const relativePath = path.join('scripts', `${baseName}_obf.js`).replace(/\\/g, '/');
  const targetPath = path.resolve(config.uploadPath, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const obfuscatedCode = result.getObfuscatedCode();
  fs.writeFileSync(targetPath, header ? `${header}\n\n${obfuscatedCode}` : obfuscatedCode, 'utf8');

  db.prepare('UPDATE script_versions SET obfuscated_file_path = ? WHERE id = ?').run(relativePath, versionData.id);
  versionData.obfuscated_file_path = relativePath;
  return relativePath;
}

function getRuntimeSettings() {
  const rows = db.prepare(`
    SELECT key, value
    FROM site_config
    WHERE key IN (
      'runtime_base_url',
      'runtime_manifest_url',
      'runtime_fallback_urls',
      'runtime_heartbeat_interval',
      'runtime_offline_grace_minutes'
    )
  `).all();

  const map = rows.reduce((result, item) => {
    result[item.key] = item.value;
    return result;
  }, {});

  let fallbackUrls = [];
  try {
    fallbackUrls = JSON.parse(map.runtime_fallback_urls || '[]');
  } catch (error) {
    fallbackUrls = [];
  }

  return {
    runtimeBaseUrl: String(map.runtime_base_url || '').trim(),
    runtimeManifestUrl: String(map.runtime_manifest_url || '').trim(),
    fallbackUrls,
    heartbeatInterval: Number(map.runtime_heartbeat_interval || 120) || 120,
    offlineGraceMinutes: Number(map.runtime_offline_grace_minutes || 30) || 30
  };
}

function getRuntimeBaseUrl(runtimeSettings) {
  return String(runtimeSettings?.runtimeBaseUrl || runtimeSettings?.baseUrl || '').trim();
}

function collectScriptCode(script, versionData, filePath) {
  const sourcePath = resolveStoredFilePath(filePath, 'script');
  if (!sourcePath) {
    return null;
  }

  const code = fs.readFileSync(sourcePath, 'utf8');
  const originalSourcePath = resolveStoredFilePath(versionData.file_path, 'script');
  const originalCode = originalSourcePath ? fs.readFileSync(originalSourcePath, 'utf8') : code;
  const runtimeSettings = getRuntimeSettings();
  const runtimeBaseUrl = getRuntimeBaseUrl(runtimeSettings);
  const assertGrantCoverage = (generatedCode) => {
    validateGeneratedWrapperIntegrity({
      originalCode,
      generatedCode,
      mode: String(script.release_mode || '') || 'direct'
    });

    const sourceGrants = collectUserScriptGrants(originalCode).filter(grant => grant !== 'none');
    if (!sourceGrants.length) {
      return generatedCode;
    }

    const generatedGrants = new Set(collectUserScriptGrants(generatedCode).filter(grant => grant !== 'none'));
    const missingGrants = sourceGrants.filter(grant => !generatedGrants.has(grant));
    if (missingGrants.length) {
      throw new Error(`增强安装包缺少必要授权：${missingGrants.join('、')}`);
    }

    return generatedCode;
  };

  if (String(script.release_mode) === 'remote_core') {
    return assertGrantCoverage(buildRemoteCoreShellScript({ code: originalCode, script, version: versionData, runtimeBaseUrl, runtimeSettings }));
  }

  if (String(script.release_mode) === 'verified_loader') {
    return assertGrantCoverage(buildVerifiedLoaderScript({ code, headerCode: originalCode, script, version: versionData, runtimeBaseUrl, runtimeSettings }));
  }

  return code;
}

function resolveStoredFilePath(storedPath, type) {
  if (!storedPath) {
    return null;
  }

  const normalized = String(storedPath).replace(/\\/g, '/').trim();
  if (!normalized) {
    return null;
  }

  const candidates = [];
  const relativePath = normalized
    .replace(/^\.\//, '')
    .replace(/^uploads\//, '');

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  }

  candidates.push(path.resolve(normalized));
  candidates.push(path.resolve(config.uploadPath, relativePath));

  const uploadSubdir = UPLOAD_SUBDIRS[type];
  const matchedSubdir = normalized.match(/(?:^|\/)(scripts|plugins|programs|logos)(?:\/|$)/);
  const finalSubdir = matchedSubdir?.[1] || uploadSubdir;
  const sanitizedPath = normalized.split('?')[0].split('#')[0];
  const fileName = path.basename(sanitizedPath);

  if (finalSubdir && fileName) {
    candidates.push(path.resolve(config.uploadPath, finalSubdir, fileName));
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  const matchedCandidate = uniqueCandidates.find(candidate => fs.existsSync(candidate));
  if (matchedCandidate) {
    return matchedCandidate;
  }

  if (finalSubdir && fileName) {
    return findFileByBasename(path.resolve(config.uploadPath, finalSubdir), fileName);
  }

  return findFileByBasename(path.resolve(config.uploadPath), fileName);
}

function findFileByBasename(searchDir, fileName) {
  if (!fileName || !fs.existsSync(searchDir)) {
    return null;
  }

  const entries = fs.readdirSync(searchDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(searchDir, entry.name);
    if (entry.isDirectory()) {
      const matched = findFileByBasename(fullPath, fileName);
      if (matched) {
        return matched;
      }
      continue;
    }

    if (entry.name === fileName) {
      return fullPath;
    }
  }

  return null;
}

async function resolveOrFetchStoredFilePath(storedPath, type) {
  const localPath = resolveStoredFilePath(storedPath, type);
  if (localPath) {
    return localPath;
  }

  const downloadedPath = await fetchFileFromSyncNode(storedPath, type);
  if (!downloadedPath) {
    return null;
  }

  return resolveStoredFilePath(downloadedPath, type) || resolveStoredFilePath(storedPath, type);
}

async function resolveOrFetchManagedFilePath(meta) {
  const localPath = resolveStoredFilePath(meta.storedPath, meta.type);
  if (localPath) {
    return localPath;
  }

  console.warn('[download] 本地文件缺失，尝试按存储路径回源', {
    type: meta.type,
    name: meta.name,
    version: meta.version,
    storedPath: meta.storedPath
  });

  const downloadedByPath = await fetchFileFromSyncNode(meta.storedPath, meta.type);
  if (downloadedByPath) {
    persistManagedStoredPath(meta, downloadedByPath);
    const fetchedLocalPath = resolveStoredFilePath(downloadedByPath, meta.type);
    if (fetchedLocalPath) {
      return fetchedLocalPath;
    }
  }

  console.warn('[download] 按存储路径回源失败，尝试按业务标识回源', {
    type: meta.type,
    name: meta.name,
    version: meta.version,
    variant: meta.variant
  });

  const downloadedByMeta = await fetchManagedFileFromSyncNode(meta);
  if (downloadedByMeta) {
    persistManagedStoredPath(meta, downloadedByMeta);
    return resolveStoredFilePath(downloadedByMeta, meta.type);
  }

  console.error('[download] 文件最终仍不存在', {
    type: meta.type,
    name: meta.name,
    version: meta.version,
    variant: meta.variant,
    storedPath: meta.storedPath
  });

  return null;
}

async function fetchFileFromSyncNode(storedPath, type) {
  if (!storedPath) {
    return null;
  }

  const node = db.prepare("SELECT * FROM sync_nodes WHERE enabled = 1 AND direction IN ('pull', 'both') ORDER BY last_sync_at DESC, id DESC LIMIT 1").get();
  if (!node) {
    return null;
  }

  try {
    const response = await fetch(`${node.url}/api/sync/file?path=${encodeURIComponent(storedPath)}`, {
      headers: { 'X-Sync-Key': node.api_key },
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      return null;
    }

    const relativeStoredPath = buildLocalStoredPath(storedPath, UPLOAD_SUBDIRS[type]);
    const localPath = path.resolve(config.uploadPath, relativeStoredPath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return relativeStoredPath.replace(/\\/g, '/');
  } catch (error) {
    console.error(`回源拉取文件失败 ${storedPath}:`, error.message);
    return null;
  }
}

async function fetchManagedFileFromSyncNode(meta) {
  const node = db.prepare("SELECT * FROM sync_nodes WHERE enabled = 1 AND direction IN ('pull', 'both') ORDER BY last_sync_at DESC, id DESC LIMIT 1").get();
  if (!node) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      type: meta.type,
      name: meta.name
    });

    if (meta.version) {
      params.set('version', String(meta.version));
    }
    if (meta.variant) {
      params.set('variant', meta.variant);
    }
    if (meta.storedPath) {
      params.set('storedPath', meta.storedPath);
    }

    const response = await fetch(`${node.url}/api/sync/managed-file?${params.toString()}`, {
      headers: { 'X-Sync-Key': node.api_key },
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      console.error('[download] 按业务标识回源失败', {
        url: `${node.url}/api/sync/managed-file?${params.toString()}`,
        status: response.status
      });
      return null;
    }

    const sourceFileNameHeader = response.headers.get('x-source-filename');
    const sourceFileName = sourceFileNameHeader ? decodeURIComponent(sourceFileNameHeader) : '';
    const relativeStoredPath = getManagedFallbackStoredPath(meta, sourceFileName);
    const localPath = path.resolve(config.uploadPath, relativeStoredPath);

    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return relativeStoredPath.replace(/\\/g, '/');
  } catch (error) {
    console.error('[download] 按业务标识回源异常', {
      type: meta.type,
      name: meta.name,
      version: meta.version,
      error: error.message
    });
    return null;
  }
}

function getManagedFallbackStoredPath(meta, sourceFileName) {
  if (meta.storedPath) {
    return buildLocalStoredPath(meta.storedPath, UPLOAD_SUBDIRS[meta.type]);
  }

  const dir = UPLOAD_SUBDIRS[meta.type] || '';
  const rawBaseName = sourceFileName || `${meta.name || meta.type}-${meta.version || 'latest'}`;
  const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*]+/g, '_');
  return dir ? path.join(dir, safeBaseName) : safeBaseName;
}

function persistManagedStoredPath(meta, storedPath) {
  if (!storedPath || !meta.recordId) {
    return;
  }

  if (meta.type === 'script') {
    if (meta.variant === 'obfuscated') {
      db.prepare('UPDATE script_versions SET obfuscated_file_path = ? WHERE id = ?').run(storedPath, meta.recordId);
    } else {
      db.prepare('UPDATE script_versions SET file_path = ? WHERE id = ?').run(storedPath, meta.recordId);
    }
    return;
  }

  if (meta.type === 'plugin') {
    db.prepare('UPDATE plugins SET file_path = ? WHERE id = ?').run(storedPath, meta.recordId);
    return;
  }

  if (meta.type === 'program') {
    db.prepare('UPDATE programs SET file_path = ? WHERE id = ?').run(storedPath, meta.recordId);
  }
}

function buildLocalStoredPath(storedPath, fallbackDir) {
  const normalized = String(storedPath).replace(/\\/g, '/').trim();
  const matchedDir = normalized.match(/(?:^|\/)(scripts|plugins|programs|logos)(?:\/|$)/);
  const subdir = matchedDir?.[1] || fallbackDir || '';
  const fileName = path.basename(normalized.split('?')[0].split('#')[0]);

  if (subdir) {
    return path.join(subdir, fileName);
  }

  return fileName;
}

// 下载脚本
router.get('/script/:id', optionalAuthWithQuery, async (req, res) => {
  const { id } = req.params;
  const { version, password } = req.query;

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);

  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  // 私密脚本验证（管理员跳过所有验证）
  if (script.is_private && !req.admin) {
    // 私密脚本且不展示在列表中，只有管理员能下载
    if (!script.show_in_list) {
      return res.status(403).json({ code: 403, message: '该脚本仅管理员可下载' });
    }
    // 私密脚本展示在列表中，需要密码验证
    if (script.access_password && script.access_password !== password) {
      return res.status(403).json({ code: 403, message: '需要密码访问' });
    }
  }

  // 获取版本
  let versionData;
  if (version) {
    versionData = db.prepare(
      'SELECT * FROM script_versions WHERE script_id = ? AND version = ?'
    ).get(id, version);
  } else {
    versionData = db.prepare(
      'SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(id);
  }

  if (!versionData) {
    return res.status(404).json({ code: 404, message: '脚本版本不存在' });
  }

  // 根据用户身份获取文件路径
  const scriptVariant = req.admin ? 'original' : (script.enable_obfuscation && versionData.obfuscated_file_path ? 'obfuscated' : 'original');
  const filePath = await resolveOrFetchManagedFilePath({
    type: 'script',
    name: script.name,
    version: versionData.version,
    variant: scriptVariant,
    storedPath: getDownloadFilePath(script, versionData, req.admin),
    recordId: versionData.id
  });

  if (!filePath) {
    return res.status(404).json({ code: 404, message: '脚本文件不存在' });
  }

  // 记录下载统计
  recordDownload('script', id, req);

  // 设置响应头，触发油猴安装
  const fileName = `${script.name}.user.js`;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

  res.sendFile(filePath);
});

// 下载插件
router.get('/plugin/:id', async (req, res) => {
  const { id } = req.params;

  const plugin = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);

  if (!plugin) {
    return res.status(404).json({ code: 404, message: '插件不存在' });
  }

  const filePath = await resolveOrFetchManagedFilePath({
    type: 'plugin',
    name: plugin.name,
    version: plugin.version,
    storedPath: plugin.file_path,
    recordId: plugin.id
  });

  if (!filePath) {
    return res.status(404).json({ code: 404, message: '插件文件不存在' });
  }

  // 记录下载统计
  recordDownload('plugin', id, req);

  // 设置响应头
  const ext = path.extname(plugin.file_path);
  const fileName = `${plugin.name}${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

  res.sendFile(filePath);
});

// 下载程序
router.get('/program/:id', async (req, res) => {
  const { id } = req.params;

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);

  if (!program) {
    return res.status(404).json({ code: 404, message: '程序不存在' });
  }

  const filePath = await resolveOrFetchManagedFilePath({
    type: 'program',
    name: program.name,
    version: program.version,
    storedPath: program.file_path,
    recordId: program.id
  });

  if (!filePath) {
    return res.status(404).json({ code: 404, message: '程序文件不存在' });
  }

  // 记录下载统计
  recordDownload('program', id, req);

  // 设置响应头
  const ext = path.extname(program.file_path);
  const fileName = `${program.name}${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

  res.sendFile(filePath);
});

// 安装脚本（触发油猴安装弹窗）
async function handleInstallScript(req, res) {
  const { id } = req.params;
  const { version, password } = req.query;

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);

  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  // 私密脚本验证（管理员跳过所有验证）
  const hasAccessCookie = hasScriptAccessCookie(req, id);
  if (script.is_private && !req.admin) {
    // 私密脚本且不展示在列表中，只有管理员能下载
    if (!script.show_in_list) {
      return res.status(403).json({ code: 403, message: '该脚本仅管理员可下载' });
    }
    // 私密脚本展示在列表中，需要密码验证
    if (script.access_password && !hasAccessCookie && script.access_password !== password) {
      return res.status(403).json({ code: 403, message: '需要密码访问' });
    }
  }

  // 获取版本
  let versionData;
  if (version) {
    versionData = db.prepare(
      'SELECT * FROM script_versions WHERE script_id = ? AND version = ?'
    ).get(id, version);
  } else {
    versionData = db.prepare(
      'SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(id);
  }

  if (!versionData) {
    return res.status(404).json({ code: 404, message: '脚本版本不存在' });
  }

  // 根据用户身份获取文件路径
  const userPackage = true;
  const shouldProtectInstallPackage = Number(script.enable_obfuscation) === 1 || String(script.release_mode) === 'verified_loader';
  const obfuscationTarget = shouldProtectInstallPackage ? { ...script, enable_obfuscation: 1 } : script;
  const obfuscatedPath = ensureObfuscatedScriptFile(obfuscationTarget, versionData);
  const useObfuscated = shouldProtectInstallPackage && Boolean(obfuscatedPath);
  const scriptVariant = useObfuscated ? 'obfuscated' : 'original';
  const storedPath = getDownloadFilePath(script, versionData, Boolean(req.admin), { forceUserPackage: userPackage });
  const filePath = await resolveOrFetchManagedFilePath({
    type: 'script',
    name: script.name,
    version: versionData.version,
    variant: scriptVariant,
    storedPath: useObfuscated ? obfuscatedPath : storedPath,
    recordId: versionData.id
  });

  if (!filePath) {
    return res.status(404).json({ code: 404, message: '脚本文件不存在' });
  }

  // 记录下载统计
  recordDownload('script', id, req);

  const fileName = `${script.name}.user.js`;
  let generatedCode;
  try {
    generatedCode = collectScriptCode(script, versionData, filePath);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message || '安装包生成失败' });
  }
  if (!generatedCode) {
    return res.status(404).json({ code: 404, message: '脚本文件不存在' });
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return res.send(generatedCode);
}

router.get(/^\/install\/(\d+)\.user\.js$/, optionalAuthWithQuery, (req, res, next) => {
  const matched = String(req.path || req.originalUrl || '').match(/\/install\/(\d+)\.user\.js/);
  req.params.id = matched ? matched[1] : req.params[0];
  return handleInstallScript(req, res, next);
});
router.get('/install/:id', optionalAuthWithQuery, handleInstallScript);

module.exports = router;
