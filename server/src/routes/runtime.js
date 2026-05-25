const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../models/database');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');
const remoteCoreModuleTemplate = require('../templates/remoteCoreModuleTemplate');

const router = express.Router();

const RUNTIME_SETTING_KEYS = {
  runtimeBaseUrl: 'runtime_base_url',
  runtimeManifestUrl: 'runtime_manifest_url',
  runtimeFallbackUrls: 'runtime_fallback_urls',
  heartbeatInterval: 'runtime_heartbeat_interval',
  offlineGraceMinutes: 'runtime_offline_grace_minutes'
};

function generateAuthorizationCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function parseJson(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return fallback;
  }
}

function decodeUtf8Base64(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (error) {
    return '';
  }
}

function normalizeTextField(payload, field) {
  const base64Key = `${field}Base64`;
  const decoded = decodeUtf8Base64(payload?.[base64Key]);
  if (decoded) {
    return decoded.trim();
  }

  const rawValue = payload?.[field];
  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  return String(rawValue).trim();
}

function normalizeRuntimePayload(payload) {
  return {
    ...payload,
    applicantName: normalizeTextField(payload, 'applicantName'),
    contact: normalizeTextField(payload, 'contact'),
    purpose: normalizeTextField(payload, 'purpose'),
    remark: normalizeTextField(payload, 'remark'),
    reviewNote: normalizeTextField(payload, 'reviewNote'),
    deviceLabel: normalizeTextField(payload, 'deviceLabel')
  };
}

function inferOsName(meta = {}) {
  const ua = String(meta.ua || '').toLowerCase();
  const platform = String(meta.platform || '').toLowerCase();
  if (/windows/.test(ua) || platform.includes('win')) return 'Win';
  if (/android/.test(ua)) return 'Android';
  if (/iphone|ipad|ios/.test(ua)) return 'iPhone/iPad';
  if (/mac os|macintosh/.test(ua) || platform.includes('mac')) return 'macOS';
  if (/linux/.test(ua) || platform.includes('linux')) return 'Linux';
  return meta.platform || '未知系统';
}

function inferBrowserName(meta = {}) {
  const ua = String(meta.ua || '');
  if (/Edg\/(\d+)/.test(ua)) return `Edge ${RegExp.$1}`;
  if (/OPR\/(\d+)/.test(ua)) return `Opera ${RegExp.$1}`;
  if (/Chrome\/(\d+)/.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return `Chrome ${RegExp.$1}`;
  if (/Firefox\/(\d+)/.test(ua)) return `Firefox ${RegExp.$1}`;
  if (/Version\/(\d+).+Safari/.test(ua) && !/Chrome\//.test(ua)) return `Safari ${RegExp.$1}`;
  return '未知浏览器';
}

function normalizeDeviceMeta(meta = {}) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  return {
    ...meta,
    ua: String(meta.ua || ''),
    platform: String(meta.platform || ''),
    language: String(meta.language || ''),
    timezone: String(meta.timezone || ''),
    screen: String(meta.screen || ''),
    deviceMemory: meta.deviceMemory || '',
    hardwareConcurrency: meta.hardwareConcurrency || '',
    vendor: String(meta.vendor || '')
  };
}

function buildDeviceSummary(item = {}) {
  const meta = normalizeDeviceMeta(item.device_meta || item.deviceMeta || {});
  const labelText = String(item.device_label || item.deviceLabel || '');
  if (!meta.platform && /win/i.test(labelText)) meta.platform = 'Win';
  if (!meta.language) {
    const languageMatch = labelText.match(/([a-z]{2}-[A-Z]{2})/);
    if (languageMatch) meta.language = languageMatch[1];
  }
  if (!meta.ua && /edge/i.test(labelText)) meta.ua = 'Edge/0';
  if (!meta.ua && /chrome/i.test(labelText)) meta.ua = 'Chrome/0';
  if (!meta.ua && /firefox/i.test(labelText)) meta.ua = 'Firefox/0';
  const language = meta.language || '';
  const parts = [inferOsName(meta), inferBrowserName(meta)].filter(Boolean);
  if (language) {
    parts.push(language);
  }

  return {
    ...item,
    device_meta: meta,
    device_summary: parts.join(' · ') || item.device_label || '未知设备',
    device_label: item.device_label || parts.join(' · ') || '未知设备'
  };
}

function getRuntimeSettings(req) {
  const rows = db.prepare(`
    SELECT key, value FROM site_config
    WHERE key IN ('runtime_base_url', 'runtime_manifest_url', 'runtime_fallback_urls', 'runtime_heartbeat_interval', 'runtime_offline_grace_minutes')
  `).all();
  const map = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    runtimeBaseUrl: (map.runtime_base_url || '').trim() || requestBaseUrl,
    runtimeManifestUrl: (map.runtime_manifest_url || '').trim(),
    fallbackUrls: parseJson(map.runtime_fallback_urls, []),
    heartbeatInterval: Number(map.runtime_heartbeat_interval || 120) || 120,
    offlineGraceMinutes: Number(map.runtime_offline_grace_minutes || 30) || 30
  };
}

function saveRuntimeSettings(payload) {
  const insert = db.prepare('INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  insert.run(RUNTIME_SETTING_KEYS.runtimeBaseUrl, String(payload.runtimeBaseUrl || '').trim());
  insert.run(RUNTIME_SETTING_KEYS.runtimeManifestUrl, String(payload.runtimeManifestUrl || '').trim());
  insert.run(RUNTIME_SETTING_KEYS.runtimeFallbackUrls, JSON.stringify(Array.isArray(payload.fallbackUrls) ? payload.fallbackUrls.filter(Boolean) : []));
  insert.run(RUNTIME_SETTING_KEYS.heartbeatInterval, String(Number(payload.heartbeatInterval || 120) || 120));
  insert.run(RUNTIME_SETTING_KEYS.offlineGraceMinutes, String(Number(payload.offlineGraceMinutes || 30) || 30));
}

function getScriptById(scriptId) {
  return db.prepare('SELECT * FROM scripts WHERE id = ?').get(scriptId);
}

function extractUserScriptParts(code = '') {
  const source = String(code || '');
  const headerMatch = source.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  if (!headerMatch) {
    return { header: '', body: source.trim() };
  }

  return {
    header: headerMatch[0],
    body: source.replace(headerMatch[0], '').trim()
  };
}

function indentCode(code = '', indent = '  ') {
  return String(code || '')
    .split('\n')
    .map(line => `${indent}${line}`)
    .join('\n');
}

function normalizeRemoteModuleCodeForDelivery(source) {
  return String(source || '')
    .replace(/(logger\.info\('remote core scaffold boot', \{[\s\S]*?\n\s*\}\))(\s*\n\s*\()/g, '$1;$2');
}

function buildRemoteModuleScaffold({ script, sourceVersion, sourceCode }) {
  const { body } = extractUserScriptParts(sourceCode);
  if (!body) {
    throw new Error('当前版本脚本内容为空，无法生成远程模块草稿');
  }

  const safeVersion = String(sourceVersion || 'latest').replace(/[^a-zA-Z0-9_]/g, '_');
  return [
    'export async function bootstrap(context) {',
    '  function createSafeLogger(sourceLogger) {',
    '    const fallbackLogger = typeof console !== "undefined" ? console : {}',
    '    const make = (level) => (...args) => {',
    '      const candidate = sourceLogger && typeof sourceLogger[level] === "function" ? sourceLogger[level].bind(sourceLogger) : null',
    '      const fallback = typeof fallbackLogger[level] === "function"',
    '        ? fallbackLogger[level].bind(fallbackLogger)',
    '        : (typeof fallbackLogger.log === "function" ? fallbackLogger.log.bind(fallbackLogger) : null)',
    '      const fn = candidate || fallback',
    '      if (!fn) return',
    '      try {',
    '        fn(...args)',
    '      } catch (error) {}',
    '    }',
    '    return {',
    '      info: make("info"),',
    '      warn: make("warn"),',
    '      error: make("error"),',
    '      debug: make("debug"),',
    '      log: make("log"),',
    '      trace: make("trace")',
    '    }',
    '  }',
    '  const runtimeConfig = context.runtimeConfig || {};',
    '  const logger = createSafeLogger(context.logger);',
    '  const request = typeof context.request === "function" ? context.request : async () => ({});',
    '  const scriptInfo = context.script || {};',
    `  const guardKey = '__remote_core_boot_${script.id}_${safeVersion}';`,
    '',
    '  if (window[guardKey]) {',
    "    logger.info('remote core scaffold already booted');",
    '    return;',
    '  }',
    '',
    '  window[guardKey] = true;',
    "  logger.info('remote core scaffold boot', {",
    `    sourceVersion: ${JSON.stringify(sourceVersion || '')},`,
    '    moduleVersion: runtimeConfig.activeModuleVersion || runtimeConfig.appVersion || scriptInfo.version,',
    '    runtimeVersion: scriptInfo.version',
    '  });',
    '',
    '  // The original script body from the latest uploaded version starts here.',
    indentCode(body),
    '}',
    '',
    'export async function destroy(context) {',
    '  function createSafeLogger(sourceLogger) {',
    '    const fallbackLogger = typeof console !== "undefined" ? console : {};',
    '    const make = (level) => (...args) => {',
    '      const candidate = sourceLogger && typeof sourceLogger[level] === "function" ? sourceLogger[level].bind(sourceLogger) : null;',
    '      const fallback = typeof fallbackLogger[level] === "function"',
    '        ? fallbackLogger[level].bind(fallbackLogger)',
    '        : (typeof fallbackLogger.log === "function" ? fallbackLogger.log.bind(fallbackLogger) : null);',
    '      const fn = candidate || fallback;',
    '      if (!fn) return;',
    '      try {',
    '        fn(...args);',
    '      } catch (error) {}',
    '    };',
    '    return { info: make("info"), warn: make("warn"), error: make("error"), debug: make("debug"), log: make("log"), trace: make("trace") };',
    '  }',
    '  const logger = createSafeLogger(context.logger);',
    "  logger.info('remote core scaffold destroy');",
    '}',
    '',
    'export function getHealth() {',
    '  return {',
    '    ok: true,',
    "    source: 'scaffold',",
    '    timestamp: new Date().toISOString()',
    '  }',
    '}'
  ].join('\n');
}

function parseUserScriptHeaderMeta(header = '') {
  const meta = {
    name: '',
    version: '',
    description: '',
    grants: [],
    requires: [],
    matches: [],
    includes: [],
    excludes: [],
    connects: [],
    resources: [],
    runAt: '',
    noframes: false,
    sandbox: '',
    injectInto: ''
  };

  String(header || '').split('\n').forEach((line) => {
    const match = line.match(/\/\/\s*@([^\s]+)\s+(.+)/);
    if (!match) return;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'name' || key === 'version' || key === 'description') {
      meta[key] = value;
      return;
    }
    if (key === 'run-at') meta.runAt = value;
    if (key === 'sandbox') meta.sandbox = value;
    if (key === 'inject-into') meta.injectInto = value;
    if (key === 'grant') meta.grants.push(value);
    if (key === 'require') meta.requires.push(value);
    if (key === 'match') meta.matches.push(value);
    if (key === 'include') meta.includes.push(value);
    if (key === 'exclude') meta.excludes.push(value);
    if (key === 'connect') meta.connects.push(value);
    if (key === 'resource') meta.resources.push(value);
    if (key === 'noframes') meta.noframes = true;
  });

  return meta;
}

function buildRemoteModuleAnalysis({ script, sourceVersion, sourceCode }) {
  const extracted = extractUserScriptParts(sourceCode);
  const headerMeta = parseUserScriptHeaderMeta(extracted.header);
  const body = String(extracted.body || '');
  const warnings = [];
  const recommendations = [];
  const featureFlags = [];
  const selectors = [];

  const pushFeature = (flag) => {
    if (!featureFlags.includes(flag)) {
      featureFlags.push(flag);
    }
  };

  if (/GM_(addStyle|getValue|setValue|deleteValue|xmlHttpRequest|registerMenuCommand)/.test(body)) pushFeature('gm_api');
  if (/fetch\s*\(|XMLHttpRequest|GM_xmlhttpRequest/.test(body)) pushFeature('network');
  if (/localStorage|sessionStorage/.test(body)) pushFeature('local_state');
  if (/unsafeWindow/.test(body)) {
    pushFeature('unsafe_window');
    warnings.push('检测到 unsafeWindow，建议人工复核全局作用域依赖');
  }
  if (/eval\s*\(|new Function\s*\(/.test(body)) warnings.push('检测到动态执行代码，建议人工复核');
  if (/document\.write\s*\(/.test(body)) warnings.push('检测到 document.write，建议确认不会破坏页面加载');
  if (/export\s+\{|export\s+(async\s+)?function|import\s+/.test(body)) warnings.push('正文中已经包含模块语法，建议确认是否需要再拆分');
  if (/querySelector(All)?\s*\(/.test(body)) {
    pushFeature('dom_selectors');
    selectors.push('可把稳定选择器抽到 runtimeConfig.selectors');
  }
  if (/innerText|textContent|innerHTML/.test(body)) {
    pushFeature('ui_copy');
    recommendations.push('可把文案和提示语抽到 runtimeConfig.copy');
  }
  if (/setInterval\s*\(|setTimeout\s*\(/.test(body)) {
    pushFeature('timing');
    recommendations.push('可把节奏参数抽到 runtimeConfig.settings');
  }
  if (headerMeta.grants.includes('none') && /GM_[A-Za-z]+/.test(body)) {
    warnings.push('头部声明为 @grant none，但正文仍在使用 GM_*');
  }

  const bodyLines = body.split('\n').filter(Boolean).length;
  return {
    scriptId: script.id,
    scriptName: script.name,
    sourceVersion,
    releaseMode: String(script.release_mode || 'direct'),
    autoWrapMode: String(script.release_mode || 'direct') === 'remote_core' ? 'bootstrap(context)+runtimeConfig' : 'full-body-preserve-header',
    bodyLines,
    header: headerMeta,
    featureFlags,
    selectors,
    warnings,
    recommendations,
    compatibility: {
      autoWrapable: bodyLines > 0,
      manualReviewRequired: warnings.length > 0 || featureFlags.includes('unsafe_window')
    },
    suggestedRuntimeConfig: {
      appVersion: sourceVersion,
      selectors: {},
      copy: {},
      settings: {},
      featureFlags: {},
      notes: []
    }
  };
}

function ensureRuntimeEnabled(script) {
  if (!script) {
    throw new Error('脚本不存在');
  }

  if (Number(script.runtime_enabled) !== 1) {
    throw new Error('当前脚本未启用运行时能力');
  }
}

function ensureAuthorizationEnabled(script) {
  ensureRuntimeEnabled(script);
  if ((script.auth_mode || 'none') === 'none') {
    throw new Error('当前脚本未启用授权审批');
  }
}

function getAuthorizationByCode(scriptId, authorizationCode) {
  return db.prepare(`
    SELECT * FROM script_authorizations
    WHERE script_id = ? AND authorization_code = ?
    LIMIT 1
  `).get(scriptId, authorizationCode);
}

function isAuthorizationExpired(authorization) {
  if (!authorization) return true;
  if (authorization.status !== 'approved') return true;
  if (authorization.starts_at && new Date(authorization.starts_at).getTime() > Date.now()) return true;
  if (authorization.expires_at && new Date(authorization.expires_at).getTime() < Date.now()) return true;
  return false;
}

function getAuthorizationSummary(authorization) {
  if (!authorization) return null;
  return {
    id: authorization.id,
    authorizationCode: authorization.authorization_code,
    applicantName: authorization.applicant_name,
    status: authorization.status,
    deviceLimit: authorization.device_limit,
    expiresAt: authorization.expires_at,
    lastActiveAt: authorization.last_active_at
  };
}

function getDeviceRecord(authorizationId, deviceFingerprint) {
  return db.prepare(`
    SELECT * FROM script_authorization_devices
    WHERE authorization_id = ? AND device_fingerprint = ? AND status = 'active'
    LIMIT 1
  `).get(authorizationId, deviceFingerprint);
}

function getActiveDeviceCount(authorizationId) {
  return db.prepare(`
    SELECT COUNT(*) AS count FROM script_authorization_devices
    WHERE authorization_id = ? AND status = 'active'
  `).get(authorizationId).count;
}

function upsertDeviceBinding(script, authorization, payload) {
  if (!script.allow_device_binding) {
    return null;
  }

  const existingDevice = getDeviceRecord(authorization.id, payload.deviceFingerprint);
  if (existingDevice) {
    db.prepare(`
      UPDATE script_authorization_devices
      SET device_label = ?, device_meta = ?, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payload.deviceLabel || existingDevice.device_label, JSON.stringify(payload.deviceMeta || {}), existingDevice.id);
    return db.prepare('SELECT * FROM script_authorization_devices WHERE id = ?').get(existingDevice.id);
  }

  const currentCount = getActiveDeviceCount(authorization.id);
  const deviceLimit = Number(authorization.device_limit || script.default_device_limit || 1);
  if (currentCount >= deviceLimit) {
    throw new Error('该授权码已绑定其他设备，请联系管理员处理换绑');
  }

  const result = db.prepare(`
    INSERT INTO script_authorization_devices (
      authorization_id, script_id, device_fingerprint, device_label, device_meta
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    authorization.id,
    script.id,
    payload.deviceFingerprint,
    payload.deviceLabel || '',
    JSON.stringify(payload.deviceMeta || {})
  );

  return db.prepare('SELECT * FROM script_authorization_devices WHERE id = ?').get(result.lastInsertRowid);
}

function ensureAuthorizationForRuntime(script, payload) {
  if (!script) {
    throw new Error('脚本不存在');
  }

  if ((script.auth_mode || 'none') === 'none') {
    return { authorization: null, device: null };
  }

  if (!payload.authorizationCode) {
    throw new Error('缺少授权码');
  }

  const authorization = getAuthorizationByCode(script.id, payload.authorizationCode);
  if (!authorization) {
    throw new Error('授权码不存在');
  }

  if (isAuthorizationExpired(authorization)) {
    throw new Error('授权码不可用或已过期');
  }

  let device = null;
  if (script.allow_device_binding) {
    if (!payload.deviceFingerprint) {
      throw new Error('缺少设备标识');
    }
    device = getDeviceRecord(authorization.id, payload.deviceFingerprint);
    if (!device) {
      throw new Error('当前设备未绑定该授权码');
    }
    db.prepare(`
      UPDATE script_authorization_devices
      SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(device.id);
    device = db.prepare('SELECT * FROM script_authorization_devices WHERE id = ?').get(device.id);
  }

  db.prepare(`
    UPDATE script_authorizations
    SET last_active_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(authorization.id);

  return { authorization, device };
}

function resolveSessionByToken(sessionToken) {
  return db.prepare('SELECT * FROM script_runtime_sessions WHERE session_token = ? LIMIT 1').get(sessionToken);
}

function createRuntimeEvent({ scriptId, authorizationId = null, deviceId = null, sessionId = null, eventType, currentUrl = '', payload = null }) {
  db.prepare(`
    INSERT INTO script_runtime_events (
      script_id, authorization_id, device_id, session_id, event_type, event_payload, current_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(scriptId, authorizationId, deviceId, sessionId, eventType, payload ? JSON.stringify(payload) : null, currentUrl || '');
}

function closeStaleRuntimeSessions() {
  db.prepare(`
    UPDATE script_runtime_sessions
    SET status = 'ended',
        ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP),
        duration_seconds = CAST((julianday(COALESCE(last_heartbeat_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400 AS INTEGER),
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'active'
      AND last_heartbeat_at IS NOT NULL
      AND julianday('now') - julianday(last_heartbeat_at) > (10.0 / 1440.0)
  `).run();
}

function closeAllExpiredRuntimeSessions() {
  db.prepare(`
    UPDATE script_runtime_sessions
    SET status = 'ended',
        ended_at = COALESCE(ended_at, last_heartbeat_at, CURRENT_TIMESTAMP),
        duration_seconds = CAST((julianday(COALESCE(last_heartbeat_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400 AS INTEGER),
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'active'
      AND (
        last_heartbeat_at IS NULL
        OR julianday('now') - julianday(last_heartbeat_at) > (10.0 / 1440.0)
      )
  `).run();
}

function getRemoteModuleDir(scriptId) {
  return path.join(config.uploadPath, 'runtime-modules', String(scriptId));
}

function getRemoteModuleFilePath(scriptId, version) {
  return path.join(getRemoteModuleDir(scriptId), `module-${version}.js`);
}

function parseManifestRecord(record) {
  if (!record) return null;
  return {
    ...record,
    manifest_json: parseJson(record.manifest_json, {}),
    remote_config_json: parseJson(record.remote_config_json, {})
  };
}

function parseModuleRecord(record) {
  if (!record) return null;
  return record;
}

function getLatestPublishedManifest(scriptId) {
  return db.prepare(`
    SELECT * FROM script_remote_manifests
    WHERE script_id = ? AND status = 'published'
    ORDER BY published_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(scriptId);
}

function getManifestByVersion(scriptId, version) {
  return db.prepare('SELECT * FROM script_remote_manifests WHERE script_id = ? AND version = ? LIMIT 1').get(scriptId, version);
}

function getRemoteModuleByVersion(scriptId, version) {
  return db.prepare('SELECT * FROM script_remote_modules WHERE script_id = ? AND version = ? LIMIT 1').get(scriptId, version);
}

function publishManifest(scriptId, version) {
  const manifest = getManifestByVersion(scriptId, version);
  if (!manifest) {
    throw new Error('Manifest 不存在');
  }

  if (manifest.active_module_version) {
    const activeModule = getRemoteModuleByVersion(scriptId, manifest.active_module_version);
    if (!activeModule || activeModule.status !== 'published') {
      throw new Error('激活模块版本未发布，不能发布 Manifest');
    }
  }

  db.prepare(`
    UPDATE script_remote_manifests
    SET status = 'draft', updated_at = CURRENT_TIMESTAMP
    WHERE script_id = ? AND id != ? AND status = 'published'
  `).run(scriptId, manifest.id);

  db.prepare(`
    UPDATE script_remote_manifests
    SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(manifest.id);

  return getManifestByVersion(scriptId, version);
}

function ensureRemoteCoreEnabled(script) {
  ensureRuntimeEnabled(script);
  if ((script.release_mode || '') !== 'remote_core') {
    throw new Error('当前脚本未启用远程核心模式');
  }
}

router.get('/settings', authMiddleware, (req, res) => {
  res.json({ code: 200, data: getRuntimeSettings(req) });
});

router.put('/settings', authMiddleware, (req, res) => {
  saveRuntimeSettings(req.body || {});
  res.json({ code: 200, message: '运行时配置已保存', data: getRuntimeSettings(req) });
});

router.get('/template/module', authMiddleware, (req, res) => {
  res.json({
    code: 200,
    data: {
      fileName: 'remote-core-module-template.js',
      entry: 'bootstrap(context)',
      content: remoteCoreModuleTemplate,
      requirements: [
        '必须导出 bootstrap(context)',
        '可选导出 destroy(context) 和 getHealth()',
        '不得在模块内硬编码服务器地址',
        '运行时配置统一从 context.runtimeConfig 读取'
      ]
    }
  });
});

router.get('/remote/scripts/:scriptId/scaffold/latest', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const latestVersion = db.prepare(`
    SELECT * FROM script_versions
    WHERE script_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(script.id);

  if (!latestVersion?.file_path) {
    return res.status(404).json({ code: 404, message: '请先上传一个可运行的脚本版本，再生成远程模块草稿' });
  }

  const sourcePath = path.resolve(latestVersion.file_path);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ code: 404, message: '当前脚本版本文件不存在，请重新上传后再试' });
  }

  const sourceVersion = latestVersion.version || script.current_version || '1.0.0';
  const sourceCode = fs.readFileSync(sourcePath, 'utf8');
  const content = buildRemoteModuleScaffold({ script, sourceVersion, sourceCode });
  const analysis = buildRemoteModuleAnalysis({ script, sourceVersion, sourceCode });

  res.json({
    code: 200,
    data: {
      sourceVersion,
      moduleVersion: sourceVersion,
      moduleName: `${script.name}-remote-module`,
      manifestVersion: sourceVersion,
      description: `从当前上传版本 ${sourceVersion} 自动生成的远程模块草稿`,
      runtimeConfig: {
        appVersion: sourceVersion,
        featureFlags: {},
        selectors: {},
        copy: {},
        settings: {}
      },
      analysis,
      content
    }
  });
});

router.get('/remote/scripts/:scriptId/manifest', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  const list = db.prepare(`
    SELECT * FROM script_remote_manifests
    WHERE script_id = ?
    ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, updated_at DESC, created_at DESC
  `).all(script.id).map(parseManifestRecord);

  res.json({ code: 200, data: list });
});

router.put('/remote/scripts/:scriptId/manifest', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const payload = req.body || {};
  if (!payload.version) {
    return res.status(400).json({ code: 400, message: 'Manifest 版本不能为空' });
  }

  const version = String(payload.version).trim();
  const manifestJson = payload.manifest || {};
  const remoteConfigJson = payload.runtimeConfig || {};
  const existing = db.prepare('SELECT * FROM script_remote_manifests WHERE script_id = ? AND version = ?').get(script.id, version);

  if (payload.activeModuleVersion) {
    const targetModule = getRemoteModuleByVersion(script.id, payload.activeModuleVersion);
    if (!targetModule) {
      return res.status(400).json({ code: 400, message: '指定的远程模块版本不存在' });
    }
  }

  if (existing) {
    db.prepare(`
      UPDATE script_remote_manifests
      SET status = ?, manifest_json = ?, remote_config_json = ?, active_module_version = ?, description = ?,
          published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.status || existing.status,
      JSON.stringify(manifestJson),
      JSON.stringify(remoteConfigJson),
      payload.activeModuleVersion || null,
      payload.description || '',
      payload.status || existing.status,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO script_remote_manifests (
        script_id, version, status, manifest_json, remote_config_json, active_module_version, description, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      script.id,
      version,
      payload.status || 'draft',
      JSON.stringify(manifestJson),
      JSON.stringify(remoteConfigJson),
      payload.activeModuleVersion || null,
      payload.description || '',
      (payload.status || 'draft') === 'published' ? new Date().toISOString() : null
    );
  }

  const saved = db.prepare('SELECT * FROM script_remote_manifests WHERE script_id = ? AND version = ?').get(script.id, version);
  res.json({ code: 200, message: 'Manifest 已保存', data: parseManifestRecord(saved) });
});

router.post('/remote/scripts/:scriptId/manifest/:version/publish', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
    const published = publishManifest(script.id, req.params.version);
    res.json({ code: 200, message: 'Manifest 已发布', data: parseManifestRecord(published) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message });
  }
});

router.post('/remote/scripts/:scriptId/manifest/:version/activate-module', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
    const manifest = getManifestByVersion(script.id, req.params.version);
    if (!manifest) {
      return res.status(404).json({ code: 404, message: 'Manifest 不存在' });
    }

    const targetVersion = String((req.body || {}).moduleVersion || '').trim();
    if (!targetVersion) {
      return res.status(400).json({ code: 400, message: '模块版本不能为空' });
    }
    const targetModule = getRemoteModuleByVersion(script.id, targetVersion);
    if (!targetModule || targetModule.status !== 'published') {
      return res.status(400).json({ code: 400, message: '指定模块不存在或未发布' });
    }

    db.prepare(`
      UPDATE script_remote_manifests
      SET active_module_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetVersion, manifest.id);

    const updated = getManifestByVersion(script.id, req.params.version);
    res.json({ code: 200, message: 'Manifest 激活模块已切换', data: parseManifestRecord(updated) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message });
  }
});

router.post('/remote/scripts/:scriptId/rollback', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
    const targetManifestVersion = String((req.body || {}).manifestVersion || '').trim();
    if (!targetManifestVersion) {
      return res.status(400).json({ code: 400, message: '回滚目标 Manifest 版本不能为空' });
    }

    const rolledBack = publishManifest(script.id, targetManifestVersion);
    res.json({ code: 200, message: '远程核心版本已回滚', data: parseManifestRecord(rolledBack) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message });
  }
});

router.get('/remote/scripts/:scriptId/modules', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  const list = db.prepare(`
    SELECT * FROM script_remote_modules
    WHERE script_id = ?
    ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, updated_at DESC, created_at DESC
  `).all(script.id).map(parseModuleRecord);

  res.json({ code: 200, data: list });
});

router.post('/remote/scripts/:scriptId/modules', authMiddleware, (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const payload = req.body || {};
  if (!payload.version || !payload.code) {
    return res.status(400).json({ code: 400, message: '模块版本和代码不能为空' });
  }

  const version = String(payload.version).trim();
  const moduleDir = getRemoteModuleDir(script.id);
  fs.mkdirSync(moduleDir, { recursive: true });
  const filePath = getRemoteModuleFilePath(script.id, version);
  fs.writeFileSync(filePath, String(payload.code), 'utf-8');

  const existing = db.prepare('SELECT * FROM script_remote_modules WHERE script_id = ? AND version = ?').get(script.id, version);
  if (existing) {
    db.prepare(`
      UPDATE script_remote_modules
      SET module_name = ?, description = ?, entry_name = ?, file_path = ?, status = ?,
          published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.moduleName || existing.module_name,
      payload.description || '',
      payload.entryName || 'bootstrap',
      filePath,
      payload.status || existing.status,
      payload.status || existing.status,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO script_remote_modules (
        script_id, version, module_name, description, entry_name, file_path, status, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      script.id,
      version,
      payload.moduleName || `${script.name}-remote-module`,
      payload.description || '',
      payload.entryName || 'bootstrap',
      filePath,
      payload.status || 'draft',
      (payload.status || 'draft') === 'published' ? new Date().toISOString() : null
    );
  }

  const saved = db.prepare('SELECT * FROM script_remote_modules WHERE script_id = ? AND version = ?').get(script.id, version);
  res.json({ code: 200, message: '远程模块已保存', data: parseModuleRecord(saved) });
});

router.get('/remote/modules/:id/code', authMiddleware, (req, res) => {
  const moduleRecord = db.prepare('SELECT * FROM script_remote_modules WHERE id = ?').get(req.params.id);
  if (!moduleRecord) {
    return res.status(404).json({ code: 404, message: '远程模块不存在' });
  }
  if (!fs.existsSync(moduleRecord.file_path)) {
    return res.status(404).json({ code: 404, message: '远程模块文件不存在' });
  }

  res.json({
    code: 200,
    data: {
      ...moduleRecord,
      code: fs.readFileSync(moduleRecord.file_path, 'utf-8')
    }
  });
});

router.post('/remote/modules/:id/publish', authMiddleware, (req, res) => {
  const moduleRecord = db.prepare('SELECT * FROM script_remote_modules WHERE id = ?').get(req.params.id);
  if (!moduleRecord) {
    return res.status(404).json({ code: 404, message: '远程模块不存在' });
  }

  db.prepare(`
    UPDATE script_remote_modules
    SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(moduleRecord.id);

  res.json({ code: 200, message: '远程模块已发布' });
});

router.post('/remote/modules/:id/unpublish', authMiddleware, (req, res) => {
  const moduleRecord = db.prepare('SELECT * FROM script_remote_modules WHERE id = ?').get(req.params.id);
  if (!moduleRecord) {
    return res.status(404).json({ code: 404, message: '远程模块不存在' });
  }

  const publishedManifest = getLatestPublishedManifest(moduleRecord.script_id);
  if (publishedManifest && publishedManifest.active_module_version === moduleRecord.version) {
    return res.status(400).json({ code: 400, message: '当前模块已被已发布 Manifest 使用，请先切换或回滚 Manifest' });
  }

  db.prepare(`
    UPDATE script_remote_modules
    SET status = 'draft', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(moduleRecord.id);

  res.json({ code: 200, message: '远程模块已转为草稿' });
});

router.get('/requests', authMiddleware, (req, res) => {
  const { scriptId } = req.query;
  const status = String(req.query.status || '').trim();
  const where = [];
  const params = [];
  if (scriptId) {
    where.push('r.script_id = ?');
    params.push(scriptId);
  }
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const list = db.prepare(`
    SELECT r.*, s.name AS script_name, a.authorization_code
    FROM script_auth_requests r
    JOIN scripts s ON s.id = r.script_id
    LEFT JOIN script_authorizations a ON a.id = r.authorization_id
    ${whereClause}
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
  `).all(...params).map(item => buildDeviceSummary({
    ...item,
    device_meta: parseJson(item.device_meta, {})
  }));
  res.json({ code: 200, data: list });
});

router.post('/requests/:id/approve', authMiddleware, (req, res) => {
  const normalizedPayload = normalizeRuntimePayload(req.body || {});
  const requestRecord = db.prepare('SELECT * FROM script_auth_requests WHERE id = ?').get(req.params.id);
  if (!requestRecord) {
    return res.status(404).json({ code: 404, message: '申请记录不存在' });
  }
  if (requestRecord.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '当前申请已处理' });
  }

  const script = getScriptById(requestRecord.script_id);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }
  try {
    ensureAuthorizationEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const payload = normalizedPayload;
  const authorizationCode = String(payload.authorizationCode || generateAuthorizationCode()).trim().toUpperCase();
  const deviceLimit = Number(payload.deviceLimit || script.default_device_limit || 1) || 1;
  const allowRebind = payload.allowRebind === undefined ? 1 : (payload.allowRebind ? 1 : 0);

  const tx = db.transaction(() => {
    const authorizationResult = db.prepare(`
      INSERT INTO script_authorizations (
        script_id, authorization_code, applicant_name, contact, purpose, remark, status,
        device_limit, allow_rebind, starts_at, expires_at, approved_by, review_note
      ) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)
    `).run(
      script.id,
      authorizationCode,
      payload.applicantName || requestRecord.applicant_name,
      payload.contact || requestRecord.contact || '',
      payload.purpose || requestRecord.purpose || '',
      payload.remark || requestRecord.remark || '',
      deviceLimit,
      allowRebind,
      payload.startsAt || null,
      payload.expiresAt || null,
      req.admin.username,
      payload.reviewNote || ''
    );

    db.prepare(`
      UPDATE script_auth_requests
      SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
          authorization_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payload.reviewNote || '', req.admin.username, authorizationResult.lastInsertRowid, requestRecord.id);
  });

  try {
    tx();
    res.json({
      code: 200,
      message: '审批通过并已生成授权码',
      data: db.prepare('SELECT * FROM script_authorizations WHERE authorization_code = ?').get(authorizationCode)
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

router.post('/requests/:id/reject', authMiddleware, (req, res) => {
  const payload = normalizeRuntimePayload(req.body || {});
  const requestRecord = db.prepare('SELECT * FROM script_auth_requests WHERE id = ?').get(req.params.id);
  if (!requestRecord) {
    return res.status(404).json({ code: 404, message: '申请记录不存在' });
  }

  db.prepare(`
    UPDATE script_auth_requests
    SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.reviewNote || '', req.admin.username, requestRecord.id);

  res.json({ code: 200, message: '申请已拒绝' });
});

router.get('/authorizations', authMiddleware, (req, res) => {
  const { scriptId, status, keyword } = req.query;
  const where = ['1=1'];
  const params = [];

  if (scriptId) {
    where.push('a.script_id = ?');
    params.push(scriptId);
  }
  if (status) {
    where.push('a.status = ?');
    params.push(status);
  }
  if (keyword) {
    where.push('(a.authorization_code LIKE ? OR a.applicant_name LIKE ? OR s.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const list = db.prepare(`
    SELECT a.*, s.name AS script_name,
      (SELECT COUNT(*) FROM script_authorization_devices d WHERE d.authorization_id = a.id AND d.status = 'active') AS active_device_count
    FROM script_authorizations a
    JOIN scripts s ON s.id = a.script_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.updated_at DESC, a.created_at DESC
  `).all(...params);
  res.json({ code: 200, data: list });
});

router.delete('/authorizations/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '授权记录不存在' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE script_auth_requests SET authorization_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE authorization_id = ?').run(existing.id);
    db.prepare('DELETE FROM script_runtime_events WHERE authorization_id = ?').run(existing.id);
    db.prepare('DELETE FROM script_runtime_sessions WHERE authorization_id = ?').run(existing.id);
    db.prepare('DELETE FROM script_authorization_devices WHERE authorization_id = ?').run(existing.id);
    db.prepare('DELETE FROM script_authorizations WHERE id = ?').run(existing.id);
  });

  tx();
  res.json({ code: 200, message: '授权记录已删除' });
});

router.post('/authorizations', authMiddleware, (req, res) => {
  const payload = normalizeRuntimePayload(req.body || {});
  if (!payload.scriptId || !payload.applicantName) {
    return res.status(400).json({ code: 400, message: '脚本和使用人不能为空' });
  }

  const script = getScriptById(payload.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureAuthorizationEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const authorizationCode = String(payload.authorizationCode || generateAuthorizationCode()).trim().toUpperCase();
  const result = db.prepare(`
    INSERT INTO script_authorizations (
      script_id, authorization_code, applicant_name, contact, purpose, remark, status,
      device_limit, allow_rebind, starts_at, expires_at, approved_by, review_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    script.id,
    authorizationCode,
    payload.applicantName,
    payload.contact || '',
    payload.purpose || '',
    payload.remark || '',
    payload.status || 'approved',
    Number(payload.deviceLimit || script.default_device_limit || 1) || 1,
    payload.allowRebind === undefined ? 1 : (payload.allowRebind ? 1 : 0),
    payload.startsAt || null,
    payload.expiresAt || null,
    req.admin.username,
    payload.reviewNote || ''
  );

  res.json({ code: 200, message: '授权已创建', data: db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(result.lastInsertRowid) });
});

router.put('/authorizations/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '授权记录不存在' });
  }

  const payload = normalizeRuntimePayload(req.body || {});
  db.prepare(`
    UPDATE script_authorizations
    SET applicant_name = ?, contact = ?, purpose = ?, remark = ?, status = ?, device_limit = ?,
        allow_rebind = ?, starts_at = ?, expires_at = ?, review_note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payload.applicantName || existing.applicant_name,
    payload.contact ?? existing.contact,
    payload.purpose ?? existing.purpose,
    payload.remark ?? existing.remark,
    payload.status || existing.status,
    Number(payload.deviceLimit || existing.device_limit || 1) || 1,
    payload.allowRebind === undefined ? existing.allow_rebind : (payload.allowRebind ? 1 : 0),
    payload.startsAt === undefined ? existing.starts_at : (payload.startsAt || null),
    payload.expiresAt === undefined ? existing.expires_at : (payload.expiresAt || null),
    payload.reviewNote ?? existing.review_note,
    existing.id
  );

  res.json({ code: 200, message: '授权已更新', data: db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(existing.id) });
});

router.post('/authorizations/:id/deactivate', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '授权记录不存在' });
  }

  db.prepare(`
    UPDATE script_authorizations
    SET status = 'disabled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(existing.id);

  res.json({ code: 200, message: '授权已停用' });
});

router.post('/authorizations/:id/activate', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '授权记录不存在' });
  }

  db.prepare(`
    UPDATE script_authorizations
    SET status = 'approved', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(existing.id);

  res.json({ code: 200, message: '授权已启用' });
});

router.post('/authorizations/:id/reset-devices', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorizations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '授权记录不存在' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE script_authorization_devices
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE authorization_id = ? AND status = 'active'
    `).run(existing.id);

    db.prepare(`
      UPDATE script_runtime_sessions
      SET status = 'ended', ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE authorization_id = ? AND status = 'active'
    `).run(existing.id);
  });

  tx();
  res.json({ code: 200, message: '已清除该授权的设备绑定和在线会话' });
});

router.get('/devices', authMiddleware, (req, res) => {
  const { scriptId, status, authorizationCode, keyword } = req.query;
  const where = ['1=1'];
  const params = [];

  if (scriptId) {
    where.push('d.script_id = ?');
    params.push(scriptId);
  }
  if (status) {
    where.push('d.status = ?');
    params.push(status);
  }
  if (authorizationCode) {
    where.push('a.authorization_code = ?');
    params.push(authorizationCode);
  }
  if (keyword) {
    where.push('(d.device_label LIKE ? OR a.applicant_name LIKE ? OR s.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const list = db.prepare(`
    SELECT d.*, a.authorization_code, a.applicant_name, s.name AS script_name
    FROM script_authorization_devices d
    JOIN script_authorizations a ON a.id = d.authorization_id
    JOIN scripts s ON s.id = d.script_id
    WHERE ${where.join(' AND ')}
    ORDER BY d.last_seen_at DESC, d.created_at DESC
  `).all(...params).map(item => buildDeviceSummary({
    ...item,
    device_meta: parseJson(item.device_meta, {})
  }));
  res.json({ code: 200, data: list });
});

router.post('/devices/:id/deactivate', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM script_authorization_devices WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '设备记录不存在' });
  }
  db.prepare(`
    UPDATE script_authorization_devices
    SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(existing.id);
  res.json({ code: 200, message: '设备绑定已解除' });
});

router.get('/sessions', authMiddleware, (req, res) => {
  closeAllExpiredRuntimeSessions();
  const { scriptId, status, authorizationCode, keyword } = req.query;
  const where = ['1=1'];
  const params = [];

  if (scriptId) {
    where.push('srs.script_id = ?');
    params.push(scriptId);
  }
  if (status) {
    where.push('srs.status = ?');
    params.push(status);
  }
  if (authorizationCode) {
    where.push('sa.authorization_code = ?');
    params.push(authorizationCode);
  }
  if (keyword) {
    where.push('(sa.applicant_name LIKE ? OR s.name LIKE ? OR sad.device_label LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const list = db.prepare(`
    SELECT srs.*, s.name AS script_name, sa.authorization_code, sa.applicant_name, sad.device_label, sad.device_meta
    FROM script_runtime_sessions srs
    JOIN scripts s ON s.id = srs.script_id
    LEFT JOIN script_authorizations sa ON sa.id = srs.authorization_id
    LEFT JOIN script_authorization_devices sad ON sad.id = srs.device_id
    WHERE ${where.join(' AND ')}
    ORDER BY srs.last_heartbeat_at DESC, srs.started_at DESC
    LIMIT 200
  `).all(...params).map(item => buildDeviceSummary({ ...item, device_meta: parseJson(item.device_meta, {}) }));
  res.json({ code: 200, data: list });
});

router.get('/events', authMiddleware, (req, res) => {
  const { scriptId, eventType, authorizationCode, keyword } = req.query;
  const where = ['1=1'];
  const params = [];

  if (scriptId) {
    where.push('sre.script_id = ?');
    params.push(scriptId);
  }
  if (eventType) {
    where.push('sre.event_type = ?');
    params.push(eventType);
  }
  if (authorizationCode) {
    where.push('sa.authorization_code = ?');
    params.push(authorizationCode);
  }
  if (keyword) {
    where.push('(s.name LIKE ? OR sa.applicant_name LIKE ? OR sre.current_url LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const list = db.prepare(`
    SELECT sre.*, s.name AS script_name, sa.authorization_code, sa.applicant_name, sad.device_label, sad.device_meta
    FROM script_runtime_events sre
    JOIN scripts s ON s.id = sre.script_id
    LEFT JOIN script_authorizations sa ON sa.id = sre.authorization_id
    LEFT JOIN script_authorization_devices sad ON sad.id = sre.device_id
    WHERE ${where.join(' AND ')}
    ORDER BY sre.created_at DESC
    LIMIT 200
  `).all(...params).map(item => buildDeviceSummary({
    ...item,
    device_meta: parseJson(item.device_meta, {}),
    event_payload: parseJson(item.event_payload, {})
  }));
  res.json({ code: 200, data: list });
});

router.get('/config/:scriptId', (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const manifest = db.prepare(`
    SELECT * FROM script_remote_manifests
    WHERE script_id = ? AND status = 'published'
    ORDER BY published_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(script.id);

  if (!manifest) {
    return res.status(404).json({ code: 404, message: '远程配置不存在' });
  }

  const parsedManifest = parseManifestRecord(manifest);
  res.json({ code: 200, data: parsedManifest.remote_config_json || {} });
});

router.get('/manifest/:scriptId', (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const manifest = db.prepare(`
    SELECT * FROM script_remote_manifests
    WHERE script_id = ? AND status = 'published'
    ORDER BY published_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(script.id);

  if (!manifest) {
    return res.status(404).json({ code: 404, message: 'Manifest 未发布' });
  }

  const parsedManifest = parseManifestRecord(manifest);
  res.json({
    code: 200,
    data: {
      version: parsedManifest.version,
      moduleVersion: parsedManifest.active_module_version,
      activeModuleVersion: parsedManifest.active_module_version,
      runtimeConfig: parsedManifest.remote_config_json || {},
      manifest: parsedManifest.manifest_json || {},
      description: parsedManifest.description || ''
    }
  });
});

router.get('/module/:scriptId/:version', (req, res) => {
  const script = getScriptById(req.params.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureRemoteCoreEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const moduleRecord = db.prepare(`
    SELECT * FROM script_remote_modules
    WHERE script_id = ? AND version = ? AND status = 'published'
    LIMIT 1
  `).get(script.id, req.params.version);

  if (!moduleRecord) {
    return res.status(404).json({ code: 404, message: '远程模块不存在或未发布' });
  }
  if (!fs.existsSync(moduleRecord.file_path)) {
    return res.status(404).json({ code: 404, message: '远程模块文件不存在' });
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(normalizeRemoteModuleCodeForDelivery(fs.readFileSync(moduleRecord.file_path, 'utf-8')));
});

router.post('/auth-request', (req, res) => {
  const payload = normalizeRuntimePayload(req.body || {});
  if (!payload.scriptId || !payload.applicantName) {
    return res.status(400).json({ code: 400, message: '脚本和使用人不能为空' });
  }

  const script = getScriptById(payload.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  try {
    ensureAuthorizationEnabled(script);
  } catch (error) {
    return res.status(400).json({ code: 400, message: error.message });
  }

  const duplicate = db.prepare(`
    SELECT id FROM script_auth_requests
    WHERE script_id = ? AND applicant_name = ? AND status = 'pending' AND device_fingerprint = ?
    LIMIT 1
  `).get(script.id, payload.applicantName, payload.deviceFingerprint || '');
  if (duplicate) {
    return res.json({ code: 200, message: '已存在待审批申请，请等待管理员处理', data: { requestId: duplicate.id } });
  }

  const result = db.prepare(`
    INSERT INTO script_auth_requests (
      script_id, applicant_name, contact, purpose, remark, device_fingerprint, device_label, device_meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    script.id,
    payload.applicantName,
    payload.contact || '',
    payload.purpose || '',
    payload.remark || '',
    payload.deviceFingerprint || '',
    payload.deviceLabel || '',
    JSON.stringify(payload.deviceMeta || {})
  );

  createRuntimeEvent({
    scriptId: script.id,
    eventType: 'auth_request',
    currentUrl: '',
    payload: {
      applicantName: payload.applicantName,
      deviceLabel: payload.deviceLabel || ''
    }
  });

  res.json({ code: 200, message: '授权申请已提交，请等待管理员审批', data: { requestId: result.lastInsertRowid } });
});

router.get('/auth-request/:id/status', (req, res) => {
  const requestRecord = db.prepare(`
    SELECT r.*, a.authorization_code
    FROM script_auth_requests r
    LEFT JOIN script_authorizations a ON a.id = r.authorization_id
    WHERE r.id = ?
    LIMIT 1
  `).get(req.params.id);

  if (!requestRecord) {
    return res.status(404).json({ code: 404, message: '申请记录不存在' });
  }

  const deviceFingerprint = String(req.query.deviceFingerprint || '').trim();
  if (deviceFingerprint && requestRecord.device_fingerprint && requestRecord.device_fingerprint !== deviceFingerprint) {
    return res.status(403).json({ code: 403, message: '当前设备无权查看该申请状态' });
  }

  res.json({
    code: 200,
    data: {
      id: requestRecord.id,
      status: requestRecord.status,
      reviewNote: requestRecord.review_note || '',
      authorizationCode: requestRecord.authorization_code || ''
    }
  });
});

router.post('/activate', (req, res) => {
  try {
    const payload = req.body || {};
    const script = getScriptById(payload.scriptId);
    if (!script) {
      return res.status(404).json({ code: 404, message: '脚本不存在' });
    }

    ensureAuthorizationEnabled(script);

    const authorization = getAuthorizationByCode(script.id, payload.authorizationCode);
    if (!authorization || isAuthorizationExpired(authorization)) {
      return res.status(403).json({ code: 403, message: '授权码无效或已过期' });
    }

    const device = upsertDeviceBinding(script, authorization, payload);
    db.prepare(`
      UPDATE script_authorizations
      SET last_activated_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(authorization.id);

    createRuntimeEvent({
      scriptId: script.id,
      authorizationId: authorization.id,
      deviceId: device ? device.id : null,
      eventType: 'auth_success',
      payload: { activated: true }
    });

    res.json({ code: 200, message: '激活成功', data: { authorization: getAuthorizationSummary(authorization), device } });
  } catch (error) {
    res.status(403).json({ code: 403, message: error.message });
  }
});

router.post('/validate', (req, res) => {
  try {
    const payload = req.body || {};
    const script = getScriptById(payload.scriptId);
    if (!script) {
      return res.status(404).json({ code: 404, message: '脚本不存在' });
    }

    ensureRuntimeEnabled(script);
    const runtimeSettings = getRuntimeSettings(req);
    const { authorization, device } = ensureAuthorizationForRuntime(script, payload);

    createRuntimeEvent({
      scriptId: script.id,
      authorizationId: authorization ? authorization.id : null,
      deviceId: device ? device.id : null,
      eventType: 'startup',
      currentUrl: payload.currentUrl || '',
      payload: {
        version: payload.version || script.current_version || '',
        runtimeVersion: payload.runtimeVersion || ''
      }
    });

    res.json({
      code: 200,
      message: '验证通过',
      data: {
        allowed: true,
        authorization: getAuthorizationSummary(authorization),
        runtimeConfig: {
          heartbeatInterval: runtimeSettings.heartbeatInterval,
          offlineGraceMinutes: runtimeSettings.offlineGraceMinutes,
          runtimeBaseUrl: runtimeSettings.runtimeBaseUrl,
          fallbackUrls: runtimeSettings.fallbackUrls,
          releaseMode: script.release_mode,
          usageTrackingEnabled: Number(script.usage_tracking_enabled) === 1
        }
      }
    });
  } catch (error) {
    const script = getScriptById((req.body || {}).scriptId);
    if (script) {
      createRuntimeEvent({
        scriptId: script.id,
        eventType: 'auth_reject',
        currentUrl: (req.body || {}).currentUrl || '',
        payload: { message: error.message }
      });
    }
    res.status(403).json({ code: 403, message: error.message });
  }
});

router.post('/session/start', (req, res) => {
  try {
    const payload = req.body || {};
    const script = getScriptById(payload.scriptId);
    if (!script) {
      return res.status(404).json({ code: 404, message: '脚本不存在' });
    }

    ensureRuntimeEnabled(script);
    const { authorization, device } = ensureAuthorizationForRuntime(script, payload);
    const sessionToken = generateSessionToken();
    const result = db.prepare(`
      INSERT INTO script_runtime_sessions (
        script_id, authorization_id, device_id, session_token, runtime_version, current_url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      script.id,
      authorization ? authorization.id : null,
      device ? device.id : null,
      sessionToken,
      payload.runtimeVersion || '',
      payload.currentUrl || ''
    );

    createRuntimeEvent({
      scriptId: script.id,
      authorizationId: authorization ? authorization.id : null,
      deviceId: device ? device.id : null,
      sessionId: result.lastInsertRowid,
      eventType: 'session_start',
      currentUrl: payload.currentUrl || '',
      payload: { runtimeVersion: payload.runtimeVersion || '' }
    });

    res.json({ code: 200, message: '会话已创建', data: { sessionToken } });
  } catch (error) {
    res.status(403).json({ code: 403, message: error.message });
  }
});

router.post('/session/heartbeat', (req, res) => {
  const session = resolveSessionByToken((req.body || {}).sessionToken);
  if (!session) {
    return res.status(404).json({ code: 404, message: '会话不存在' });
  }

  db.prepare(`
    UPDATE script_runtime_sessions
    SET last_heartbeat_at = CURRENT_TIMESTAMP,
        current_url = ?,
        duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run((req.body || {}).currentUrl || session.current_url, session.id);

  createRuntimeEvent({
    scriptId: session.script_id,
    authorizationId: session.authorization_id,
    deviceId: session.device_id,
    sessionId: session.id,
    eventType: 'heartbeat',
    currentUrl: (req.body || {}).currentUrl || session.current_url,
    payload: {}
  });

  res.json({ code: 200, message: '心跳已记录' });
});

router.post('/session/end', (req, res) => {
  const session = resolveSessionByToken((req.body || {}).sessionToken);
  if (!session) {
    return res.status(404).json({ code: 404, message: '会话不存在' });
  }

  db.prepare(`
    UPDATE script_runtime_sessions
    SET ended_at = CURRENT_TIMESTAMP,
        last_heartbeat_at = CURRENT_TIMESTAMP,
        current_url = ?,
        status = 'ended',
        duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run((req.body || {}).currentUrl || session.current_url, session.id);

  createRuntimeEvent({
    scriptId: session.script_id,
    authorizationId: session.authorization_id,
    deviceId: session.device_id,
    sessionId: session.id,
    eventType: 'shutdown',
    currentUrl: (req.body || {}).currentUrl || session.current_url,
    payload: {}
  });

  res.json({ code: 200, message: '会话已结束' });
});

router.post('/event', (req, res) => {
  const payload = req.body || {};
  const script = getScriptById(payload.scriptId);
  if (!script) {
    return res.status(404).json({ code: 404, message: '脚本不存在' });
  }

  let authorization = null;
  let device = null;
  if (payload.authorizationCode) {
    authorization = getAuthorizationByCode(script.id, payload.authorizationCode);
    if (authorization && payload.deviceFingerprint) {
      device = getDeviceRecord(authorization.id, payload.deviceFingerprint);
    }
  }

  const session = payload.sessionToken ? resolveSessionByToken(payload.sessionToken) : null;
  createRuntimeEvent({
    scriptId: script.id,
    authorizationId: authorization ? authorization.id : null,
    deviceId: device ? device.id : null,
    sessionId: session ? session.id : null,
    eventType: payload.eventType || 'custom',
    currentUrl: payload.currentUrl || '',
    payload: payload.payload || {}
  });

  res.json({ code: 200, message: '事件已记录' });
});

module.exports = router;
