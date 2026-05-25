const db = require('../models/database');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const jwt = require('jsonwebtoken');
const {
  collectUserScriptGrants,
  validateGeneratedWrapperIntegrity,
  buildVerifiedLoaderScript,
  buildRemoteCoreShellScript
} = require('../utils/runtimeScript');
const { normalizeScriptDeliveryConfig } = require('../utils/scriptDelivery');

// 提取 UserScript 头部
const extractUserScriptHeader = (code) => {
  const headerMatch = code.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  if (headerMatch) {
    return {
      header: headerMatch[0],
      body: code.replace(headerMatch[0], '').trim()
    };
  }
  return { header: '', body: code };
};

// 从 UserScript 头部解析元数据
const parseUserScriptMeta = (code) => {
  const meta = {};
  const headerMatch = code.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  if (headerMatch) {
    const header = headerMatch[0];
    const lines = header.split('\n');
    lines.forEach(line => {
      const match = line.match(/\/\/\s*@(\w+)\s+(.+)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        meta[key] = value;
      }
    });
  }
  return meta;
};

// 混淆函数（保留 UserScript 头部）
const obfuscateCode = (code) => {
  try {
    const JavaScriptObfuscator = require('javascript-obfuscator');

    // 提取头部和主体
    const { header, body } = extractUserScriptHeader(code);

    // 只混淆主体部分
    const obfuscationResult = JavaScriptObfuscator.obfuscate(body, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.2,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });

    // 重新组合：头部 + 混淆后的主体
    const obfuscatedBody = obfuscationResult.getObfuscatedCode();
    return header ? `${header}\n\n${obfuscatedBody}` : obfuscatedBody;
  } catch (e) {
    console.error('混淆失败:', e.message);
    return null;
  }
};

function validateRuntimeGrantCoverage({ script, versionNumber, originalCode, protectedCode, runtimeBaseUrl = '', runtimeSettings = {} }) {
  let generatedCode = '';
  if (String(script.release_mode) === 'verified_loader') {
    generatedCode = buildVerifiedLoaderScript({
      code: protectedCode || originalCode,
      headerCode: originalCode,
      script,
      version: { version: versionNumber },
      runtimeBaseUrl,
      runtimeSettings
    });
  } else if (String(script.release_mode) === 'remote_core') {
    generatedCode = buildRemoteCoreShellScript({
      code: originalCode,
      script,
      version: { version: versionNumber },
      runtimeBaseUrl,
      runtimeSettings
    });
  } else {
    return;
  }

  validateGeneratedWrapperIntegrity({
    originalCode,
    generatedCode,
    mode: String(script.release_mode || '') || 'direct'
  });

  const sourceGrants = collectUserScriptGrants(originalCode).filter(grant => grant !== 'none');
  if (!sourceGrants.length) {
    return;
  }

  const generatedGrants = new Set(collectUserScriptGrants(generatedCode).filter(grant => grant !== 'none'));
  const missingGrants = sourceGrants.filter(grant => !generatedGrants.has(grant));
  if (missingGrants.length) {
    throw new Error(`增强安装包缺少必要授权：${missingGrants.join('、')}`);
  }
}

// 获取脚本列表
exports.getScripts = (req, res) => {
  const { category_id, keyword, is_private, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // 构建 WHERE 条件
  const whereClauses = ['1=1'];
  const params = [];

  if (category_id) {
    whereClauses.push('s.category_id = ?');
    params.push(category_id);
  }

  if (keyword) {
    whereClauses.push('(s.name LIKE ? OR s.description LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (is_private !== undefined) {
    whereClauses.push('s.is_private = ?');
    params.push(is_private);
  }

  // 非管理员：不显示私密脚本中 show_in_list=0 的，或者只显示公开脚本
  if (!req.admin) {
    // 公开脚本 或 (私密脚本且允许展示)
    whereClauses.push('(s.is_private = 0 OR (s.is_private = 1 AND s.show_in_list = 1))');
  }

  const whereStr = whereClauses.join(' AND ');

  // 计算总数
  const countSql = `SELECT COUNT(*) as total FROM scripts s WHERE ${whereStr}`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;

  // 查询列表
  const sql = `
    SELECT s.*, c.name as category_name,
    (SELECT version FROM script_versions WHERE script_id = s.id ORDER BY created_at DESC LIMIT 1) as latest_version
    FROM scripts s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE ${whereStr}
    ORDER BY s.updated_at DESC LIMIT ? OFFSET ?
  `;

  const scripts = db.prepare(sql).all(...params, parseInt(limit), parseInt(offset));

  res.json({
    code: 200,
    data: {
      list: scripts,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
};

// 获取单个脚本详情
exports.getScript = (req, res) => {
  const { id } = req.params;

  const script = db.prepare(`
    SELECT s.*, c.name as category_name
    FROM scripts s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(id);

  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  // 私密脚本且不展示在列表中，非管理员无法访问
  if (script.is_private && !script.show_in_list && !req.admin) {
    return res.status(403).json({ code: 403, message: '该脚本为私密脚本，需要管理员权限' });
  }

  // 获取版本列表
  const versions = db.prepare(
    'SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC'
  ).all(id);

  script.versions = versions;

  res.json({ code: 200, data: script });
};

// 创建脚本
exports.createScript = (req, res) => {
  const {
    name,
    description,
    category_id,
    is_private,
    show_in_list,
    access_password,
    enable_obfuscation,
    release_mode,
    auth_mode,
    runtime_enabled,
    allow_device_binding,
    binding_strategy,
    default_device_limit,
    usage_tracking_enabled
  } = req.body;
  const delivery = normalizeScriptDeliveryConfig(req.body || {});

  if (!name) {
    return res.status(400).json({ code: 400, message: '脚本名称不能为空' });
  }

  const result = db.prepare(`
    INSERT INTO scripts (
      name, description, category_id, is_private, show_in_list, access_password, enable_obfuscation,
      release_mode, auth_mode, runtime_enabled, allow_device_binding, binding_strategy, default_device_limit, usage_tracking_enabled
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || '',
    category_id || null,
    is_private ? 1 : 0,
    show_in_list !== undefined ? (show_in_list ? 1 : 0) : 1,
    access_password || null,
    delivery.enable_obfuscation ? 1 : 0,
    delivery.release_mode,
    delivery.auth_mode,
    delivery.runtime_enabled ? 1 : 0,
    delivery.allow_device_binding ? 1 : 0,
    delivery.binding_strategy,
    delivery.default_device_limit,
    delivery.usage_tracking_enabled ? 1 : 0
  );

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '创建成功', data: script });
};

// 更新脚本信息
exports.updateScript = (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category_id,
    is_private,
    show_in_list,
    access_password,
    enable_obfuscation,
    release_mode,
    auth_mode,
    runtime_enabled,
    allow_device_binding,
    binding_strategy,
    default_device_limit,
    usage_tracking_enabled
  } = req.body;

  const existing = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  const delivery = normalizeScriptDeliveryConfig(req.body || {}, existing);

  db.prepare(`
    UPDATE scripts SET
      name = ?,
      description = ?,
      category_id = ?,
      is_private = ?,
      show_in_list = ?,
      access_password = ?,
      enable_obfuscation = ?,
      release_mode = ?,
      auth_mode = ?,
      runtime_enabled = ?,
      allow_device_binding = ?,
      binding_strategy = ?,
      default_device_limit = ?,
      usage_tracking_enabled = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || existing.name,
    description ?? existing.description,
    category_id ?? existing.category_id,
    is_private !== undefined ? (is_private ? 1 : 0) : existing.is_private,
    show_in_list !== undefined ? (show_in_list ? 1 : 0) : existing.show_in_list,
    access_password ?? existing.access_password,
    delivery.enable_obfuscation ? 1 : 0,
    delivery.release_mode,
    delivery.auth_mode,
    delivery.runtime_enabled ? 1 : 0,
    delivery.allow_device_binding ? 1 : 0,
    delivery.binding_strategy,
    delivery.default_device_limit,
    delivery.usage_tracking_enabled ? 1 : 0,
    id
  );

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);

  res.json({ code: 200, message: '更新成功', data: script });
};

// 删除脚本
exports.deleteScript = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  // 删除相关版本文件
  const versions = db.prepare('SELECT file_path, obfuscated_file_path FROM script_versions WHERE script_id = ?').all(id);
  versions.forEach(v => {
    if (v.file_path) {
      const filePath = path.resolve(v.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    if (v.obfuscated_file_path) {
      const obfPath = path.resolve(v.obfuscated_file_path);
      if (fs.existsSync(obfPath)) {
        fs.unlinkSync(obfPath);
      }
    }
  });

  // 删除数据库记录（级联删除版本）
  db.prepare('DELETE FROM scripts WHERE id = ?').run(id);

  res.json({ code: 200, message: '删除成功' });
};

// 上传脚本版本
exports.uploadVersion = (req, res) => {
  const { id } = req.params;
  let { version, changelog } = req.body;

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传脚本文件' });
  }

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  if (!script) {
    // 删除已上传的文件
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  // 读取脚本内容并解析元数据
  const scriptContent = fs.readFileSync(req.file.path, 'utf-8');
  const meta = parseUserScriptMeta(scriptContent);

  // 如果没有提供版本号，从脚本头部解析
  if (!version && meta.version) {
    version = meta.version;
  }

  // 检查版本号是否已存在
  if (version) {
    const existingVersion = db.prepare(
      'SELECT * FROM script_versions WHERE script_id = ? AND version = ?'
    ).get(id, version);

    if (existingVersion) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ code: 400, message: '该版本号已存在' });
    }
  }

  // 生成版本号（如果未提供且脚本头部也没有）
  const versionNumber = version || `1.0.${Date.now()}`;

  // 重命名文件
  const ext = path.extname(req.file.originalname);
  const safeName = script.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const newFileName = `${safeName}_v${versionNumber}${ext}`;
  const newFilePath = path.join(path.dirname(req.file.path), newFileName);

  fs.renameSync(req.file.path, newFilePath);

  // 如果启用了混淆，生成混淆版本
  let obfuscatedFilePath = null;
  let obfuscatedCode = null;
  if (script.enable_obfuscation) {
    try {
      const originalCode = fs.readFileSync(newFilePath, 'utf-8');
      obfuscatedCode = obfuscateCode(originalCode);

      if (obfuscatedCode) {
        const obfFileName = `${safeName}_v${versionNumber}_obf${ext}`;
        obfuscatedFilePath = path.join(path.dirname(req.file.path), obfFileName);
        fs.writeFileSync(obfuscatedFilePath, obfuscatedCode, 'utf-8');
      }
    } catch (e) {
      console.error('生成混淆版本失败:', e.message);
    }
  }

  try {
    const originalCode = fs.readFileSync(newFilePath, 'utf-8');
    validateRuntimeGrantCoverage({
      script,
      versionNumber,
      originalCode,
      protectedCode: obfuscatedCode,
      runtimeSettings: {}
    });
  } catch (error) {
    if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath);
    if (obfuscatedFilePath && fs.existsSync(obfuscatedFilePath)) fs.unlinkSync(obfuscatedFilePath);
    return res.status(400).json({ code: 400, message: error.message });
  }

  // 保存版本记录，changelog 优先使用用户输入，否则使用脚本描述
  const finalChangelog = changelog || meta.description || '';

  const result = db.prepare(`
    INSERT INTO script_versions (script_id, version, changelog, file_path, obfuscated_file_path, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, versionNumber, finalChangelog, newFilePath, obfuscatedFilePath, req.file.size);

  // 更新脚本的当前版本
  db.prepare('UPDATE scripts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(versionNumber, id);

  const versionData = db.prepare('SELECT * FROM script_versions WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '上传成功', data: versionData });
};

// 获取脚本版本列表
exports.getVersions = (req, res) => {
  const { id } = req.params;

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  const versions = db.prepare(
    'SELECT * FROM script_versions WHERE script_id = ? ORDER BY created_at DESC'
  ).all(id);

  res.json({ code: 200, data: versions });
};

// 删除脚本版本
exports.deleteVersion = (req, res) => {
  const { id, versionId } = req.params;

  const version = db.prepare(
    'SELECT * FROM script_versions WHERE id = ? AND script_id = ?'
  ).get(versionId, id);

  if (!version) {
    return res.status(404).json({ code: 404, message: '版本不存在' });
  }

  // 删除原始文件
  if (version.file_path && fs.existsSync(version.file_path)) {
    fs.unlinkSync(version.file_path);
  }

  // 删除混淆文件
  if (version.obfuscated_file_path && fs.existsSync(version.obfuscated_file_path)) {
    fs.unlinkSync(version.obfuscated_file_path);
  }

  db.prepare('DELETE FROM script_versions WHERE id = ?').run(versionId);

  // 更新脚本的当前版本为最新版本
  const latestVersion = db.prepare(
    'SELECT version FROM script_versions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(id);

  db.prepare('UPDATE scripts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(latestVersion ? latestVersion.version : null, id);

  res.json({ code: 200, message: '删除成功' });
};

// 验证私密脚本密码
exports.verifyPassword = (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);

  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  if (!script.is_private) {
    return res.json({ code: 200, message: '该脚本无需密码' });
  }

  if (script.access_password === password) {
    const isSecureRequest = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
    const accessToken = jwt.sign(
      {
        type: 'script-access',
        scriptId: script.id
      },
      config.jwtSecret,
      { expiresIn: '10m' }
    );

    res.cookie(`script_access_${script.id}`, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest,
      maxAge: 10 * 60 * 1000,
      path: '/api/download'
    });

    return res.json({ code: 200, message: '验证成功' });
  }

  return res.status(403).json({ code: 403, message: '密码错误' });
};
