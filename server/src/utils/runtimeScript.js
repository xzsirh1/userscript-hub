const JavaScriptObfuscator = require('javascript-obfuscator');

function extractUserScriptHeader(code) {
  const headerMatch = String(code || '').match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  if (headerMatch) {
    return {
      header: headerMatch[0],
      body: String(code || '').replace(headerMatch[0], '').trim()
    };
  }

  return { header: '', body: String(code || '') };
}

function collectUserScriptGrants(code) {
  const { header } = extractUserScriptHeader(code);
  if (!header) {
    return [];
  }

  return header
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(line => line.startsWith('// @grant'))
    .map(line => line.replace(/^\/\/\s*@grant\s+/, '').trim())
    .filter(Boolean);
}

function collectUserScriptMetaEntries(code) {
  const { header } = extractUserScriptHeader(code);
  if (!header) {
    return [];
  }

  return header
    .split('\n')
    .map(line => String(line || '').trim())
    .map(line => {
      const match = line.match(/^\/\/\s*@([^\s]+)(?:\s+(.*))?$/);
      if (!match) {
        return null;
      }
      return {
        key: String(match[1] || '').trim().toLowerCase(),
        value: String(match[2] || '').trim()
      };
    })
    .filter(Boolean);
}

function collectMetaValues(entries, key) {
  return entries
    .filter(entry => entry.key === key)
    .map(entry => entry.value)
    .filter(Boolean);
}

function compareExactMetaValueSets(sourceEntries, generatedEntries, key, label) {
  const sourceValues = [...new Set(collectMetaValues(sourceEntries, key))];
  const generatedValues = [...new Set(collectMetaValues(generatedEntries, key))];

  const missingValues = sourceValues.filter(value => !generatedValues.includes(value));
  if (missingValues.length) {
    throw new Error(`增强安装包缺少必要${label}：${missingValues.join('、')}`);
  }

  const unexpectedValues = generatedValues.filter(value => !sourceValues.includes(value));
  if (unexpectedValues.length) {
    throw new Error(`增强安装包擅自新增${label}：${unexpectedValues.join('、')}`);
  }
}

function compareExactMetaPresence(sourceEntries, generatedEntries, key, label) {
  const sourceHas = sourceEntries.some(entry => entry.key === key);
  const generatedHas = generatedEntries.some(entry => entry.key === key);

  if (sourceHas && !generatedHas) {
    throw new Error(`增强安装包缺少必要${label}`);
  }

  if (!sourceHas && generatedHas) {
    throw new Error(`增强安装包擅自新增${label}`);
  }
}

function compareExactSingleMetaValue(sourceEntries, generatedEntries, key, label) {
  const sourceValues = collectMetaValues(sourceEntries, key);
  const generatedValues = collectMetaValues(generatedEntries, key);

  if (sourceValues.length && !generatedValues.length) {
    throw new Error(`增强安装包缺少必要${label}：${sourceValues[0]}`);
  }

  if (!sourceValues.length && generatedValues.length) {
    throw new Error(`增强安装包擅自新增${label}：${generatedValues[0]}`);
  }

  if (!sourceValues.length && !generatedValues.length) {
    return;
  }

  if (generatedValues[0] !== sourceValues[0]) {
    throw new Error(`增强安装包${label}被改写：原始=${sourceValues[0]}，生成=${generatedValues[0]}`);
  }
}

function compareRuntimeSandboxMetaValue(sourceEntries, generatedEntries, mode) {
  const sourceValues = collectMetaValues(sourceEntries, 'sandbox');
  const generatedValues = collectMetaValues(generatedEntries, 'sandbox');

  if (sourceValues.length || generatedValues.some(value => value !== 'DOM')) {
    compareExactSingleMetaValue(sourceEntries, generatedEntries, 'sandbox', '@sandbox');
    return;
  }

  if (!generatedValues.length) {
    return;
  }

  const protectedModes = new Set(['verified_loader', 'remote_core']);
  if (!protectedModes.has(String(mode || ''))) {
    compareExactSingleMetaValue(sourceEntries, generatedEntries, 'sandbox', '@sandbox');
  }
}

function validateGeneratedWrapperIntegrity({ originalCode, generatedCode, mode }) {
  const sourceExtracted = extractUserScriptHeader(originalCode);
  const generatedExtracted = extractUserScriptHeader(generatedCode);
  const generatedBody = String(generatedExtracted.body || '').trim();

  if (!generatedExtracted.header) {
    throw new Error(`增强安装包缺少最终 UserScript 头部：${mode}`);
  }

  if (/^\/\/\s*==UserScript==/.test(generatedBody)) {
    throw new Error(`增强安装包主体残留第二段 UserScript 头部：${mode}`);
  }

  const sourceEntries = collectUserScriptMetaEntries(originalCode);
  const generatedEntries = collectUserScriptMetaEntries(generatedCode);

  compareExactMetaValueSets(sourceEntries, generatedEntries, 'grant', '@grant');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'require', '@require');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'resource', '@resource');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'connect', '@connect');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'match', '@match');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'include', '@include');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'exclude', '@exclude');
  compareExactMetaValueSets(sourceEntries, generatedEntries, 'exclude-match', '@exclude-match');
  compareExactSingleMetaValue(sourceEntries, generatedEntries, 'run-at', '@run-at');
  compareRuntimeSandboxMetaValue(sourceEntries, generatedEntries, mode);
  compareExactSingleMetaValue(sourceEntries, generatedEntries, 'inject-into', '@inject-into');
  compareExactMetaPresence(sourceEntries, generatedEntries, 'noframes', '@noframes');

  return generatedCode;
}

function isValidGrantIdentifier(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(name || ''));
}

function upsertUserScriptMeta(header, key, value) {
  const source = String(header || '').trim();
  if (!source) return source;
  const pattern = new RegExp(`(^\\/\\/\\s*@${key}\\s+).*$`, 'm');
  if (pattern.test(source)) {
    return source.replace(pattern, `$1${value}`);
  }
  return source.replace(/\/\/\s*==\/UserScript==/, `// @${key}        ${value}\n// ==/UserScript==`);
}

function ensureUserScriptGrant(header, grantValue) {
  const source = String(header || '').trim();
  if (!source) return source;
  const escaped = grantValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exists = new RegExp(`^\\/\\/\\s*@grant\\s+${escaped}$`, 'm').test(source);
  if (exists) return source;
  return source.replace(/\/\/\s*==\/UserScript==/, `// @grant        ${grantValue}\n// ==/UserScript==`);
}

function stripLeadingUserScriptHeaders(code) {
  let next = String(code || '').trim();
  while (/^\/\/\s*==UserScript==/.test(next)) {
    const extracted = extractUserScriptHeader(next);
    if (!extracted.header) {
      break;
    }
    next = String(extracted.body || '').trim();
  }
  return next;
}

function buildRemoteHeader(header, script, version) {
  let nextHeader = String(header || '');
  const mode = String(script.release_mode || 'verified_loader');
  const baseName = String(script.name || '脚本').trim();
  const displayName = mode === 'remote_core'
    ? (/remote core/i.test(baseName) ? baseName : `${baseName} Remote Core`)
    : `${baseName} 验证增强版`;
  const lines = nextHeader.split('\n');
  const setLine = (key, value) => {
    const prefix = `// @${key}`;
    const index = lines.findIndex(line => line.trim().startsWith(prefix));
    const nextLine = `// @${key}         ${value}`;
    if (index >= 0) {
      lines[index] = nextLine;
    } else {
      const endIndex = lines.findIndex(line => line.includes('==/UserScript=='));
      if (endIndex >= 0) {
        lines.splice(endIndex, 0, nextLine);
      } else {
        lines.push(nextLine);
      }
    }
  };

  setLine('name', displayName);
  setLine('version', version.version);
  setLine('description', mode === 'remote_core'
    ? `${baseName} 的远程核心授权壳脚本，首次运行需要授权或提交申请`
    : `${baseName} 的验证增强版，首次运行需要授权或提交申请`
  );

  const protectedModes = new Set(['verified_loader', 'remote_core']);
  const hasSandbox = lines.some(line => String(line || '').trim().startsWith('// @sandbox'));
  const hasInjectInto = lines.some(line => String(line || '').trim().startsWith('// @inject-into'));
  const declaresUnsafeWindow = lines.some(line => /^\/\/\s*@grant\s+unsafeWindow\s*$/.test(String(line || '').trim()));
  if (protectedModes.has(mode) && !hasSandbox && !hasInjectInto && !declaresUnsafeWindow) {
    // Keep the runtime out of strict page CSP policies, for example Bing blocking unsafe-eval.
    setLine('sandbox', 'DOM');
  }

  const existingGrants = lines
    .map(line => {
      const trimmed = String(line || '').trim();
      if (!trimmed.startsWith('// @grant')) {
        return null;
      }
      return trimmed.replace(/^\/\/\s*@grant\s+/, '').trim() || null;
    })
    .filter(Boolean);

  const mergedGrants = existingGrants.slice();

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line.startsWith('// @grant')) {
      lines.splice(index, 1);
    }
  }

  const endIndex = lines.findIndex(line => line.includes('==/UserScript=='));
  const grantLines = mergedGrants.map(grantValue => `// @grant        ${grantValue}`);
  if (grantLines.length) {
    if (endIndex >= 0) {
      lines.splice(endIndex, 0, ...grantLines);
    } else {
      lines.push(...grantLines);
    }
  }

  return lines.join('\n');
}

function obfuscateRuntimeShell(source) {
  const code = String(source || '').trim();
  if (!code) {
    return '';
  }

  try {
    return JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      deadCodeInjection: false,
      simplify: true,
      stringArray: true,
      stringArrayThreshold: 0.75,
      renameGlobals: false
    }).getObfuscatedCode();
  } catch (error) {
    return code;
  }
}

function calcIntegrityChecksum(source) {
  const text = String(source || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function splitPackedText(source, chunkSize = 1600) {
  const text = String(source || '');
  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildShellInfo({ mode, script, version, bodyFingerprint }) {
  const shellVersion = mode === 'remote_core' ? 'remote-core-v1' : 'verified-loader-v1';
  const fingerprint = calcIntegrityChecksum([
    shellVersion,
    String(script?.id || ''),
    String(version?.version || ''),
    String(mode || ''),
    String(bodyFingerprint || '')
  ].join('|'));

  return {
    shellVersion,
    buildId: `${String(version?.version || '0')}-${fingerprint.slice(0, 6)}`,
    fingerprint,
    scriptId: script?.id || null,
    scriptVersion: version?.version || ''
  };
}

function getRuntimeDeviceDescriptorSource() {
  return `
  const inferOsName = (meta) => {
    const ua = String(meta.ua || '').toLowerCase();
    const platform = String(meta.platform || '').toLowerCase();
    if (/windows/.test(ua) || platform.includes('win')) return 'Win';
    if (/android/.test(ua)) return 'Android';
    if (/iphone|ipad|ios/.test(ua)) return 'iPhone/iPad';
    if (/mac os|macintosh/.test(ua) || platform.includes('mac')) return 'macOS';
    if (/linux/.test(ua) || platform.includes('linux')) return 'Linux';
    return meta.platform || '未知系统';
  };

  const inferBrowserName = (meta) => {
    const ua = String(meta.ua || '');
    const readVersion = (marker) => {
      const index = ua.indexOf(marker);
      if (index < 0) return '';
      const tail = ua.slice(index + marker.length);
      const match = tail.match(/^([0-9]+)/);
      return match ? match[1] : '';
    };
    const edge = readVersion('Edg/');
    if (edge) return 'Edge ' + edge;
    const opera = readVersion('OPR/');
    if (opera) return 'Opera ' + opera;
    const chrome = readVersion('Chrome/');
    if (chrome && ua.indexOf('Edg/') < 0 && ua.indexOf('OPR/') < 0) return 'Chrome ' + chrome;
    const firefox = readVersion('Firefox/');
    if (firefox) return 'Firefox ' + firefox;
    const safari = readVersion('Version/');
    if (safari && ua.indexOf('Chrome/') < 0 && ua.indexOf('Safari/') >= 0) return 'Safari ' + safari;
    return '未知浏览器';
  };

  const buildRuntimeDeviceInfo = () => {
    const meta = {
      ua: navigator.userAgent || '',
      platform: navigator.platform || '',
      language: navigator.language || '',
      timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (error) { return ''; } })(),
      screen: typeof screen !== 'undefined' ? [screen.width, screen.height, screen.colorDepth].join('x') : '',
      vendor: navigator.vendor || '',
      deviceMemory: navigator.deviceMemory || '',
      hardwareConcurrency: navigator.hardwareConcurrency || '',
      host: location.host || ''
    };
    const summary = [inferOsName(meta), inferBrowserName(meta), meta.language].filter(Boolean).join(' · ');
    return {
      label: summary || [meta.platform || 'Unknown', meta.language || 'lang'].join(' / '),
      meta
    };
  };
  `;
}

function getRuntimeUiSource() {
  return `
  const createRuntimeUi = () => {
    const hostId = '__tm_runtime_host__';
    const existing = document.getElementById(hostId);
    if (existing) {
      return existing.__tmApi;
    }

    const host = document.createElement('div');
    host.id = hostId;
    host.style.position = 'fixed';
    host.style.top = '16px';
    host.style.right = '16px';
    host.style.left = 'auto';
    host.style.bottom = 'auto';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = [
      '<style>',
      ':host{all:initial;}',
      '.tm-wrap{position:relative;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;pointer-events:none;}',
      '.tm-orb{position:absolute;top:0;right:0;width:30px;height:30px;border:none;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;background:linear-gradient(135deg,rgba(56,189,248,.72),rgba(37,99,235,.72));box-shadow:0 8px 20px rgba(15,23,42,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:0;transform:scale(.78);pointer-events:none;transition:opacity .28s cubic-bezier(.2,.8,.2,1),transform .28s cubic-bezier(.2,.8,.2,1),background .2s ease;}',
      '.tm-orb.show{opacity:1;transform:scale(1);pointer-events:auto;}',
      '.tm-card{width:min(428px,calc(100vw - 24px));max-width:min(428px,calc(100vw - 24px));min-width:0;border-radius:999px;background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(248,250,252,.88));border:1px solid rgba(148,163,184,.24);box-shadow:0 18px 44px rgba(15,23,42,.16);backdrop-filter:blur(18px) saturate(165%);-webkit-backdrop-filter:blur(18px) saturate(165%);overflow:hidden;transform-origin:top right;pointer-events:auto;transition:max-width .36s cubic-bezier(.2,.8,.2,1),max-height .36s cubic-bezier(.2,.8,.2,1),border-radius .28s ease,opacity .24s ease,transform .34s cubic-bezier(.2,.8,.2,1),box-shadow .24s ease;}',
      '.tm-card.compact{max-height:72px;}',
      '.tm-card.expanded{max-height:min(80vh,620px);border-radius:16px;}',
      '.tm-card.minimized{opacity:0;transform:translateY(-8px) scale(.94);pointer-events:none;}',
      '.tm-head{display:flex;align-items:center;gap:12px;padding:12px 14px;}',
      '.tm-icon{width:28px;height:28px;flex:0 0 28px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;background:linear-gradient(135deg,#60a5fa,#2563eb);box-shadow:inset 0 1px 0 rgba(255,255,255,.26);}',
      '.tm-card.state-success .tm-icon,.tm-orb.state-success{background:linear-gradient(135deg,rgba(52,199,89,.96),rgba(22,163,74,.96));}',
      '.tm-card.state-error .tm-icon,.tm-orb.state-error{background:linear-gradient(135deg,rgba(248,113,113,.96),rgba(220,38,38,.96));}',
      '.tm-card.state-loading .tm-icon,.tm-orb.state-loading{background:linear-gradient(135deg,rgba(56,189,248,.96),rgba(37,99,235,.96));}',
      '.tm-spinner{width:16px;height:16px;border-radius:999px;border:2px solid rgba(255,255,255,.28);border-top-color:#fff;animation:tm-spin .78s linear infinite;box-sizing:border-box;}',
      '@keyframes tm-spin{to{transform:rotate(360deg);}}',
      '.tm-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}',
      '.tm-title{font-size:15px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.tm-status{font-size:13px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.tm-actions{display:flex;align-items:center;gap:8px;}',
      '.tm-head-btn{border:none;background:rgba(15,23,42,.06);color:#475569;border-radius:999px;padding:7px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:background .2s ease,color .2s ease,transform .16s ease;}',
      '.tm-head-btn:hover{background:rgba(15,23,42,.1);color:#0f172a;transform:translateY(-1px);}',
      '.tm-head-btn.close{padding:7px 9px;min-width:32px;}',
      '.tm-body{padding:0 14px 14px;max-height:0;opacity:0;overflow:hidden;transition:max-height .36s cubic-bezier(.2,.8,.2,1),opacity .24s ease,padding-top .24s ease;}',
      '.tm-card.expanded .tm-body{max-height:min(80vh,540px);opacity:1;padding-top:4px;}',
      '.tm-hint{margin:0 0 10px;font-size:12px;line-height:1.6;color:#64748b;}',
      '.tm-form{display:flex;flex-direction:column;gap:10px;}',
      '.tm-form.hidden{display:none;}',
      '.tm-input,.tm-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.38);border-radius:12px;background:rgba(255,255,255,.82);color:#0f172a;padding:11px 12px;font:inherit;outline:none;transition:border-color .2s ease,box-shadow .2s ease,background .2s ease;}',
      '.tm-input::placeholder,.tm-textarea::placeholder{color:#94a3b8;}',
      '.tm-input:focus,.tm-textarea:focus{border-color:rgba(59,130,246,.68);box-shadow:0 0 0 4px rgba(59,130,246,.14);background:#fff;}',
      '.tm-textarea{min-height:78px;resize:vertical;}',
      '.tm-form-row{display:flex;flex-direction:column;gap:6px;}',
      '.tm-label{font-size:12px;font-weight:700;color:#475569;}',
      '.tm-btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}',
      '.tm-btn{flex:1 1 0;border:none;border-radius:12px;padding:10px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform .16s ease,opacity .16s ease,box-shadow .18s ease;}',
      '.tm-btn:hover{transform:translateY(-1px);}',
      '.tm-btn.primary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.24);}',
      '.tm-btn.warn{background:linear-gradient(135deg,#fb923c,#f97316);color:#fff;box-shadow:0 10px 20px rgba(249,115,22,.22);}',
      '.tm-btn.ghost{background:rgba(15,23,42,.06);color:#334155;}',
      '.tm-meta{margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,.14);font-size:11px;line-height:1.6;color:#94a3b8;word-break:break-all;}',
      '@media (max-width:768px){.tm-card{width:min(92vw,428px);max-width:min(92vw,428px);}.tm-card.expanded{border-radius:14px;}.tm-btn{flex:1 1 calc(50% - 4px);}.tm-status{white-space:normal;}}',
      '</style>',
      '<div class="tm-wrap">',
      '  <button type="button" class="tm-orb" data-role="orb" aria-label="打开授权状态">·</button>',
      '  <section class="tm-card compact state-loading" data-role="card">',
      '    <div class="tm-head">',
      '      <div class="tm-icon" data-role="icon"><span class="tm-spinner"></span></div>',
      '      <div class="tm-main">',
      '        <div class="tm-title" data-role="title">验证中...</div>',
      '        <div class="tm-status" data-role="status">脚本运行时正在初始化，请稍候。</div>',
      '      </div>',
      '      <div class="tm-actions">',
      '        <button type="button" class="tm-head-btn" data-role="toggle" hidden>展开</button>',
      '        <button type="button" class="tm-head-btn close" data-role="minimize" aria-label="最小化">×</button>',
      '      </div>',
      '    </div>',
      '    <div class="tm-body" data-role="body">',
      '      <p class="tm-hint" data-role="hint">请输入授权码，或切换到申请表单提交申请。整个过程不会阻挡原网页操作。</p>',
      '      <div class="tm-form hidden" data-role="auth-form">',
      '        <div class="tm-form-row">',
      '          <span class="tm-label">授权码</span>',
      '          <input class="tm-input" type="text" data-role="auth-code" placeholder="请输入授权码">',
      '        </div>',
      '        <div class="tm-btn-row">',
      '          <button type="button" class="tm-btn primary" data-role="submit-code">激活并继续</button>',
      '          <button type="button" class="tm-btn ghost" data-role="open-apply">提交申请</button>',
      '        </div>',
      '      </div>',
      '      <div class="tm-form hidden" data-role="apply-form">',
      '        <div class="tm-form-row">',
      '          <span class="tm-label">使用人</span>',
      '          <input class="tm-input" type="text" data-role="applicant" placeholder="请输入使用人名称">',
      '        </div>',
      '        <div class="tm-form-row">',
      '          <span class="tm-label">联系方式</span>',
      '          <input class="tm-input" type="text" data-role="contact" placeholder="可留空">',
      '        </div>',
      '        <div class="tm-form-row">',
      '          <span class="tm-label">用途说明</span>',
      '          <input class="tm-input" type="text" data-role="purpose" placeholder="可留空">',
      '        </div>',
      '        <div class="tm-form-row">',
      '          <span class="tm-label">备注</span>',
      '          <textarea class="tm-textarea" data-role="remark" placeholder="可留空"></textarea>',
      '        </div>',
      '        <div class="tm-btn-row">',
      '          <button type="button" class="tm-btn primary" data-role="submit-apply">提交申请</button>',
      '          <button type="button" class="tm-btn ghost" data-role="back-auth">返回授权码</button>',
      '        </div>',
      '      </div>',
      '      <div class="tm-meta" data-role="shell-meta">Shell: loading...</div>',
      '    </div>',
      '  </section>',
      '</div>'
    ].join('');

    (document.body || document.documentElement).appendChild(host);

    const card = shadow.querySelector('[data-role="card"]');
    const orb = shadow.querySelector('[data-role="orb"]');
    const titleNode = shadow.querySelector('[data-role="title"]');
    const statusNode = shadow.querySelector('[data-role="status"]');
    const iconNode = shadow.querySelector('[data-role="icon"]');
    const bodyNode = shadow.querySelector('[data-role="body"]');
    const hintNode = shadow.querySelector('[data-role="hint"]');
    const toggleBtn = shadow.querySelector('[data-role="toggle"]');
    const minimizeBtn = shadow.querySelector('[data-role="minimize"]');
    const authForm = shadow.querySelector('[data-role="auth-form"]');
    const applyForm = shadow.querySelector('[data-role="apply-form"]');
    const authCodeInput = shadow.querySelector('[data-role="auth-code"]');
    const applicantInput = shadow.querySelector('[data-role="applicant"]');
    const contactInput = shadow.querySelector('[data-role="contact"]');
    const purposeInput = shadow.querySelector('[data-role="purpose"]');
    const remarkInput = shadow.querySelector('[data-role="remark"]');
    const shellMetaNode = shadow.querySelector('[data-role="shell-meta"]');
    const submitCodeBtn = shadow.querySelector('[data-role="submit-code"]');
    const openApplyBtn = shadow.querySelector('[data-role="open-apply"]');
    const submitApplyBtn = shadow.querySelector('[data-role="submit-apply"]');
    const backAuthBtn = shadow.querySelector('[data-role="back-auth"]');
    let minimized = true;
    let launcherEnabled = false;
    let expanded = false;
    let currentStatus = 'loading';
    let viewMode = 'status';
    let autoHideTimer = null;
    let pendingAuthResolver = null;
    let pendingApplyResolver = null;
    let authSubmitCallback = null;

    const clearAutoHide = () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        autoHideTimer = null;
      }
    };

    const isInteractiveView = () => viewMode === 'auth' || viewMode === 'apply';

    const setIcon = (status) => {
      if (status === 'success') {
        iconNode.innerHTML = '✔';
      } else if (status === 'error') {
        iconNode.innerHTML = '!';
      } else {
        iconNode.innerHTML = '<span class="tm-spinner"></span>';
      }
    };

    const syncUi = () => {
      card.classList.remove('state-loading', 'state-success', 'state-error', 'compact', 'expanded', 'minimized');
      card.classList.add('state-' + currentStatus);
      card.classList.add(expanded ? 'expanded' : 'compact');
      if (minimized) {
        card.classList.add('minimized');
      }
      orb.classList.toggle('show', launcherEnabled && minimized);
      orb.classList.remove('state-loading', 'state-success', 'state-error');
      orb.classList.add('state-' + currentStatus);
      toggleBtn.hidden = !launcherEnabled;
      toggleBtn.textContent = expanded ? '收起' : '展开';
      bodyNode.setAttribute('aria-hidden', expanded ? 'false' : 'true');
      authForm.classList.toggle('hidden', viewMode !== 'auth');
      applyForm.classList.toggle('hidden', viewMode !== 'apply');
    };

    const show = () => {
      minimized = false;
      syncUi();
    };

    const minimize = () => {
      if (!launcherEnabled) {
        launcherEnabled = true;
      }
      minimized = true;
      syncUi();
    };

    const hide = () => {
      expanded = false;
      minimize();
    };

    const closeCompletely = () => {
      clearAutoHide();
      expanded = false;
      launcherEnabled = false;
      minimized = true;
      viewMode = 'status';
      syncUi();
    };

    const enableLauncher = () => {
      launcherEnabled = true;
      syncUi();
    };

    const setExpanded = (nextExpanded) => {
      expanded = !!nextExpanded;
      if (expanded) {
        show();
      } else {
        syncUi();
      }
    };

    const normalizeStatusArgs = (arg1, arg2) => {
      if (arg1 === 'loading' || arg1 === 'success' || arg1 === 'error') {
        return { status: arg1, message: arg2 || '' };
      }
      const legacyType = arg2 === 'success' || arg2 === 'error' ? arg2 : 'loading';
      return { status: legacyType, message: arg1 || '' };
    };

    const setStatus = (arg1, arg2) => {
      const normalized = normalizeStatusArgs(arg1, arg2);
      clearAutoHide();
      currentStatus = normalized.status;
      titleNode.textContent = normalized.status === 'loading'
        ? '验证中...'
        : normalized.status === 'success'
          ? '验证通过'
          : '需要处理';
      statusNode.textContent = normalized.message || (normalized.status === 'loading' ? '运行时正在初始化，请稍候。' : '');
      setIcon(normalized.status);
      if (normalized.status === 'error') {
        launcherEnabled = true;
        if (!isInteractiveView()) {
          minimized = false;
          expanded = false;
        }
      } else if (!isInteractiveView() && !expanded) {
        launcherEnabled = false;
        minimized = true;
        expanded = false;
      }
      syncUi();
    };

    const showToast = (message, type = 'success', timeout = 2400) => {
      viewMode = 'status';
      if (type === 'success') {
        closeCompletely();
        return;
      }
      setExpanded(false);
      enableLauncher();
      show();
      setStatus(type, message);
    };

    const openAuthCode = (defaultCode, promptText) => {
      clearAutoHide();
      enableLauncher();
      viewMode = 'auth';
      hintNode.textContent = promptText || '请输入授权码后激活；如果还没有授权码，可以切换到申请表单。';
      authCodeInput.value = defaultCode || authCodeInput.value || '';
      setExpanded(true);
      if (currentStatus !== 'error') {
        setStatus('error', promptText || '当前脚本需要输入授权码后才能继续运行。');
      }
      setTimeout(() => authCodeInput.focus(), 0);
    };

    const openApply = (promptText) => {
      clearAutoHide();
      enableLauncher();
      viewMode = 'apply';
      hintNode.textContent = promptText || '填写最少信息后即可提交申请。整个浮层不会阻塞网页操作。';
      setExpanded(true);
      if (currentStatus !== 'error') {
        setStatus('error', promptText || '当前脚本尚未授权，请提交申请或输入授权码。');
      }
      setTimeout(() => applicantInput.focus(), 0);
    };

    const showAuthForm = (promptText, onSubmitCallback) => {
      authSubmitCallback = typeof onSubmitCallback === 'function' ? onSubmitCallback : null;
      openAuthCode(authCodeInput.value, promptText);
    };

    const setShellInfo = (shellInfo) => {
      if (!shellInfo) return;
      shellMetaNode.textContent = 'Shell: ' + (shellInfo.shellVersion || '-') + ' | Build: ' + (shellInfo.buildId || '-') + ' | FP: ' + (shellInfo.fingerprint || '-');
    };

    const resolvePendingAuth = (payload) => {
      if (pendingAuthResolver) {
        const resolver = pendingAuthResolver;
        pendingAuthResolver = null;
        resolver(payload);
      }
    };

    const resolvePendingApply = (payload) => {
      if (pendingApplyResolver) {
        const resolver = pendingApplyResolver;
        pendingApplyResolver = null;
        resolver(payload);
      }
    };

    submitCodeBtn.addEventListener('click', () => {
      const codeValue = String(authCodeInput.value || '').trim();
      setStatus('loading', '正在提交授权码并继续...');
      if (authSubmitCallback) {
        try {
          authSubmitCallback(codeValue);
        } catch (error) {}
      }
      resolvePendingAuth({ action: 'code', value: codeValue });
    });

    openApplyBtn.addEventListener('click', () => {
      resolvePendingAuth({ action: 'apply', value: '' });
      openApply('切换到申请表单，请填写信息。');
    });

    submitApplyBtn.addEventListener('click', () => {
      setStatus('loading', '正在提交授权申请，请稍候...');
      resolvePendingApply({
        applicantName: String(applicantInput.value || '').trim(),
        contact: String(contactInput.value || '').trim(),
        purpose: String(purposeInput.value || '').trim(),
        remark: String(remarkInput.value || '').trim()
      });
    });

    backAuthBtn.addEventListener('click', () => {
      openAuthCode(authCodeInput.value, '返回授权码输入。');
    });

    toggleBtn.addEventListener('click', () => {
      setExpanded(!expanded);
    });

    minimizeBtn.addEventListener('click', () => {
      if (isInteractiveView()) {
        hide();
      } else {
        closeCompletely();
      }
    });

    orb.addEventListener('click', () => {
      show();
    });

    const waitForAuthCode = (defaultCode) => new Promise((resolve) => {
      pendingAuthResolver = resolve;
      openAuthCode(defaultCode, '请输入授权码继续启动脚本；若暂无授权码，可切换到申请表单。');
    });

    const waitForApplication = () => new Promise((resolve) => {
      pendingApplyResolver = resolve;
      openApply('当前脚本需要先提交授权申请。请填写必要信息后提交。');
    });

    setStatus('loading', '脚本运行时正在初始化，请稍候。');

    const api = { setStatus, showAuthForm, openAuthCode, openApply, waitForAuthCode, waitForApplication, showToast, show, hide, closeCompletely, minimize, setShellInfo };
    host.__tmApi = api;
    return api;
  };

  const __TM_RUNTIME_UI__ = createRuntimeUi();
  __TM_RUNTIME_UI__.setStatus('loading', '远程核心授权启动中，请稍候...');
  `;
}

function buildVerifiedLoaderScript({ code, headerCode, script, version, runtimeBaseUrl, runtimeSettings }) {
  const extracted = extractUserScriptHeader(code);
  const headerSource = extractUserScriptHeader(headerCode || code);
  const header = buildRemoteHeader(headerSource.header, script, version);
  const body = stripLeadingUserScriptHeaders(extracted.body);
  const packedBody = Buffer.from(body, 'utf8').toString('base64');
  const packedBodyChunks = splitPackedText(packedBody);
  const integrityChecksum = calcIntegrityChecksum(packedBody);
  const shellInfo = buildShellInfo({ mode: 'verified_loader', script, version, bodyFingerprint: integrityChecksum });
  const settings = {
    scriptId: script.id,
    scriptName: script.name,
    version: version.version,
    releaseMode: script.release_mode || 'verified_loader',
    authMode: script.auth_mode || 'none',
    runtimeEnabled: Number(script.runtime_enabled) === 1,
    usageTrackingEnabled: Number(script.usage_tracking_enabled) === 1,
    allowDeviceBinding: Number(script.allow_device_binding) === 1,
    bindingStrategy: script.binding_strategy || 'browser',
    heartbeatInterval: Number(runtimeSettings?.heartbeatInterval) || 120,
    offlineGraceMinutes: Number(runtimeSettings?.offlineGraceMinutes) || 30,
    runtimeBaseUrl: runtimeBaseUrl || '',
    fallbackUrls: runtimeSettings?.fallbackUrls || [],
    shellInfo
  };

  const bootstrap = `
const __TM_RUNTIME_CONFIG__ = ${JSON.stringify(settings, null, 2)};
const __TM_INTEGRITY__ = ${JSON.stringify({ checksum: integrityChecksum })};
const __tmGetPackedBody__ = () => [${packedBodyChunks.map(chunk => JSON.stringify(chunk)).join(', ')}].join('');
${getRuntimeUiSource()}
${getRuntimeDeviceDescriptorSource()}

async function __tmRuntimeBootstrap__(__tmRunMain__) {
  const cfg = __TM_RUNTIME_CONFIG__;
  const integrity = __TM_INTEGRITY__;
  const runtimeUi = __TM_RUNTIME_UI__;
  runtimeUi.setShellInfo(cfg.shellInfo);
  console.info('[TM Runtime] shell=%s build=%s fp=%s script=%s@%s', cfg.shellInfo?.shellVersion || '-', cfg.shellInfo?.buildId || '-', cfg.shellInfo?.fingerprint || '-', cfg.scriptName || '-', cfg.version || '-');
  const storagePrefix = '__tm_runtime__' + cfg.scriptId + '__';
  const gmGet = typeof GM_getValue === 'function' ? GM_getValue : null;
  const gmSet = typeof GM_setValue === 'function' ? GM_setValue : null;
  const gmDelete = typeof GM_deleteValue === 'function' ? GM_deleteValue : null;

  const calcChecksum = (text) => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const decodePackedBody = (packed) => {
    const raw = atob(String(packed || ''));
    if (typeof TextDecoder !== 'undefined') {
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    try {
      return decodeURIComponent(escape(raw));
    } catch (error) {
      return raw;
    }
  };

  const loadProtectedScriptBody = () => {
    const packed = __tmGetPackedBody__();
    if (!packed) {
      throw new Error('脚本主体缺失，无法继续运行');
    }
    if (calcChecksum(packed) !== integrity.checksum) {
      throw new Error('保护壳完整性校验失败，脚本已停止运行');
    }
    return decodePackedBody(packed);
  };

  const localGet = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(storagePrefix + key);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const localSet = (key, value) => {
    try {
      localStorage.setItem(storagePrefix + key, value);
    } catch (error) {}
  };

  const localDelete = (key) => {
    try {
      localStorage.removeItem(storagePrefix + key);
    } catch (error) {}
  };

  const readValue = async (key, fallback = null) => {
    try {
      if (gmGet) {
        const value = await gmGet(storagePrefix + key, fallback);
        return value == null ? fallback : value;
      }
    } catch (error) {}
    return localGet(key, fallback);
  };

  const writeValue = async (key, value) => {
    try {
      if (gmSet) {
        await gmSet(storagePrefix + key, value);
      }
    } catch (error) {}
    localSet(key, value);
  };

  const removeValue = async (key) => {
    try {
      if (gmDelete) {
        await gmDelete(storagePrefix + key);
      }
    } catch (error) {}
    localDelete(key);
  };

  const uuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const utf8ToBase64 = (value) => {
    const text = String(value == null ? '' : value);
    try {
      return btoa(unescape(encodeURIComponent(text)));
    } catch (error) {
      return '';
    }
  };

  const getDeviceSeed = async () => {
    let seed = await readValue('device_seed');
    if (!seed) {
      seed = uuid();
      await writeValue('device_seed', seed);
    }
    return seed;
  };

  const buildDeviceMeta = async () => {
    const seed = await getDeviceSeed();
    const deviceInfo = buildRuntimeDeviceInfo();
    const base = {
      seed,
      ...deviceInfo.meta
    };
    const fingerprintPayload = {
      seed
    };
    if (cfg.bindingStrategy === 'host') {
      fingerprintPayload.host = location.host || '';
    }
    const raw = JSON.stringify(fingerprintPayload);
    return {
      label: deviceInfo.label,
      fingerprint: raw,
      meta: base
    };
  };

  const resolveBaseUrls = () => {
    const list = [];
    if (cfg.runtimeBaseUrl) list.push(cfg.runtimeBaseUrl);
    if (Array.isArray(cfg.fallbackUrls)) {
      cfg.fallbackUrls.forEach(url => {
        if (url) list.push(url);
      });
    }
    return [...new Set(list.filter(Boolean).map(url => String(url).replace(/\\/$/, '')))];
  };

  const requestJson = async (method, endpoint, payload) => {
    const urls = resolveBaseUrls();
    let lastError = null;
    for (const baseUrl of urls) {
      try {
        const response = await fetch(baseUrl + endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: payload ? JSON.stringify(payload) : undefined
        });
        const json = await response.json().catch(() => ({ code: response.status, message: '响应解析失败' }));
        if (!response.ok || json.code >= 400) {
          lastError = new Error(json.message || ('请求失败: ' + response.status));
          lastError.code = Number(json.code || response.status || 0);
          lastError.httpStatus = Number(response.status || 0);
          lastError.responseMessage = String(json.message || '');
          continue;
        }
        return json;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('运行时服务不可用');
  };

  const shouldClearAuthorizationCode = (error) => {
    const code = Number(error && (error.code || error.httpStatus) || 0);
    const message = String(error && (error.responseMessage || error.message) || '');
    if (!message && !code) return false;
    if (message.includes('授权码无效') || message.includes('授权码不存在') || message.includes('授权码不可用') || message.includes('已过期')) return true;
    if (message.includes('当前授权已停用') || message.includes('授权记录不存在') || message.includes('缺少授权码')) return true;
    if (code === 403 && (message.includes('授权码') || message.includes('已过期') || message.includes('已停用'))) return true;
    return false;
  };

  const requestAuthorization = async (device) => {
    runtimeUi.setStatus('当前脚本需要先提交授权申请。请填写下方信息后提交，等待管理员审批。', '');
    const form = await runtimeUi.waitForApplication();
    const applicantName = form.applicantName;
    if (!applicantName) {
      throw new Error('未填写使用人名称，脚本已停止运行');
    }
    const contact = form.contact || '';
    const purpose = form.purpose || '';
    const remark = form.remark || '';
    const result = await requestJson('POST', '/api/runtime/auth-request', {
      scriptId: cfg.scriptId,
      applicantName,
      applicantNameBase64: utf8ToBase64(applicantName),
      contact,
      contactBase64: utf8ToBase64(contact),
      purpose,
      purposeBase64: utf8ToBase64(purpose),
      remark,
      remarkBase64: utf8ToBase64(remark),
      deviceFingerprint: device.fingerprint,
      deviceLabel: device.label,
      deviceLabelBase64: utf8ToBase64(device.label),
      deviceMeta: device.meta
    });
    const requestId = result.data && result.data.requestId ? result.data.requestId : null;
    runtimeUi.setStatus((result.message || '授权申请已提交') + '。若管理员已审批，面板会自动提示你输入授权码。', 'success');
    if (requestId) {
      const pollRequestStatus = async () => {
        try {
          const statusResult = await requestJson('GET', '/api/runtime/auth-request/' + requestId + '/status?deviceFingerprint=' + encodeURIComponent(device.fingerprint));
          const data = statusResult.data || {};
          if (data.status === 'approved') {
            if (data.authorizationCode) {
              await writeValue('authorization_code', data.authorizationCode);
              runtimeUi.showToast('授权申请已审批通过，正在自动激活...', 'success', 1500);
              window.setTimeout(() => window.location.reload(), 1200);
              return;
            }
            runtimeUi.setStatus('授权申请已审批通过，请输入授权码继续。', 'success');
            runtimeUi.openAuthCode(data.authorizationCode || '');
            return;
          }
          if (data.status === 'rejected') {
            runtimeUi.setStatus('授权申请已被拒绝：' + (data.reviewNote || '请联系管理员'), 'error');
            return;
          }
          window.setTimeout(pollRequestStatus, 5000);
        } catch (error) {
          window.setTimeout(pollRequestStatus, 8000);
        }
      };
      window.setTimeout(pollRequestStatus, 5000);
    }
    throw new Error(result.message || '授权申请已提交');
  };

  const ensureAuthorizationCode = async (device) => {
    if (cfg.authMode === 'none') {
      return '';
    }

    let code = await readValue('authorization_code', '');
    if (!code) {
      runtimeUi.setStatus('请输入授权码继续启动脚本；若暂无授权码，请点击“提交申请”。', '');
      const authResult = await runtimeUi.waitForAuthCode('');
      if (authResult.action === 'apply') {
        await requestAuthorization(device);
      }
      code = String(authResult.value || '').trim();
      if (!code) {
        throw new Error('未输入授权码，脚本未启动');
      }
      await writeValue('authorization_code', code.trim());
    }
    return code.trim();
  };

  const device = await buildDeviceMeta();
  runtimeUi.setStatus('正在连接运行时服务并校验授权...', '');
  const authorizationCode = await ensureAuthorizationCode(device);
  let activationResponse = null;

  if (cfg.authMode !== 'none') {
    runtimeUi.setStatus('正在校验授权码并绑定当前设备...', '');
    try {
      activationResponse = await requestJson('POST', '/api/runtime/activate', {
        scriptId: cfg.scriptId,
        authorizationCode,
        deviceFingerprint: device.fingerprint,
        deviceLabel: device.label,
        deviceMeta: device.meta
      });
    } catch (error) {
      if (shouldClearAuthorizationCode(error)) {
        await removeValue('authorization_code');
      }
      throw error;
    }
  }

  let validateResponse;
  try {
    runtimeUi.setStatus('授权码校验通过，正在验证运行环境...', '');
    validateResponse = await requestJson('POST', '/api/runtime/validate', {
      scriptId: cfg.scriptId,
      version: cfg.version,
      authorizationCode,
      deviceFingerprint: device.fingerprint,
      deviceLabel: device.label,
      runtimeVersion: '1.0.0',
      currentUrl: location.href
    });
  } catch (error) {
    if (cfg.authMode !== 'none' && shouldClearAuthorizationCode(error)) {
      await removeValue('authorization_code');
    }
    throw error;
  }

  if (!validateResponse.data || !validateResponse.data.allowed) {
    if (shouldClearAuthorizationCode({ message: validateResponse.message, code: validateResponse.code })) {
      await removeValue('authorization_code');
    }
    runtimeUi.setStatus(validateResponse.message || '授权验证失败', 'error');
    throw new Error(validateResponse.message || '授权验证失败');
  }

  let sessionToken = '';
  if (cfg.usageTrackingEnabled) {
    const sessionResponse = await requestJson('POST', '/api/runtime/session/start', {
      scriptId: cfg.scriptId,
      authorizationCode,
      deviceFingerprint: device.fingerprint,
      currentUrl: location.href,
      runtimeVersion: '1.0.0'
    });
    sessionToken = sessionResponse.data?.sessionToken || '';
  }

  let heartbeatTimer = null;
  if (cfg.usageTrackingEnabled && sessionToken) {
    const sendHeartbeat = async () => {
      try {
        await requestJson('POST', '/api/runtime/session/heartbeat', {
          sessionToken,
          currentUrl: location.href
        });
      } catch (error) {}
    };
    heartbeatTimer = setInterval(sendHeartbeat, Math.max(30000, Number(cfg.heartbeatInterval || 120) * 1000));
    window.addEventListener('beforeunload', function() {
      if (navigator.sendBeacon && cfg.runtimeBaseUrl && sessionToken) {
        try {
            navigator.sendBeacon(cfg.runtimeBaseUrl.replace(/\\/$/, '') + '/api/runtime/session/end', new Blob([
            JSON.stringify({ sessionToken, currentUrl: location.href })
          ], { type: 'application/json' }));
        } catch (error) {}
      }
    });
  }

  try {
    runtimeUi.setStatus('授权验证成功，脚本启动中...', 'success');
    const protectedScriptBody = loadProtectedScriptBody();
    await __tmRunMain__({
      authorization: validateResponse.data.authorization || activationResponse?.data?.authorization || null,
      device,
      runtimeConfig: validateResponse.data.runtimeConfig || {},
      scriptBody: protectedScriptBody
    });
    runtimeUi.showToast('授权成功，已绑定当前设备并启动脚本。', 'success', 900);
  } catch (error) {
    if (cfg.usageTrackingEnabled) {
      try {
        await requestJson('POST', '/api/runtime/event', {
          scriptId: cfg.scriptId,
          authorizationCode,
          deviceFingerprint: device.fingerprint,
          sessionToken,
          eventType: 'runtime_error',
          currentUrl: location.href,
          payload: {
            message: error && error.message ? error.message : String(error)
          }
        });
      } catch (reportError) {}
    }
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}

__tmRuntimeBootstrap__(async function(__tmContext__) {
  const __tmScriptBody__ = String(__tmContext__.scriptBody || '');
  globalThis.__TM_RUNTIME_CONTEXT__ = __tmContext__;
  try {
    return eval(__tmScriptBody__);
  } finally {
    try {
      delete globalThis.__TM_RUNTIME_CONTEXT__;
    } catch (error) {
      globalThis.__TM_RUNTIME_CONTEXT__ = undefined;
    }
  }
}).catch(function(error) {
  try {
    const runtimeUi = createRuntimeUi();
    runtimeUi.setStatus(error && error.message ? error.message : String(error), 'error');
  } catch (uiError) {}
  console.error('[TM Runtime]', error);
});
`;

  const stableBootstrap = bootstrap.trim();
  const packedShell = Buffer.from(stableBootstrap, 'utf8').toString('base64');
  const packedShellChunks = splitPackedText(packedShell);
  const shellChecksum = calcIntegrityChecksum(packedShell);
  const protectedLauncher = `
const __TM_SHELL_INTEGRITY__ = ${JSON.stringify({ checksum: shellChecksum })};
const __tmGetPackedShell__ = () => [${packedShellChunks.map(chunk => JSON.stringify(chunk)).join(', ')}].join('');

(() => {
  const calcChecksum = (text) => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const decodePackedText = (packed) => {
    const raw = atob(String(packed || ''));
    if (typeof TextDecoder !== 'undefined') {
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    try {
      return decodeURIComponent(escape(raw));
    } catch (error) {
      return raw;
    }
  };

  const packed = __tmGetPackedShell__();
  if (!packed) {
    throw new Error('运行时壳缺失，脚本已停止运行');
  }
  if (calcChecksum(packed) !== __TM_SHELL_INTEGRITY__.checksum) {
    throw new Error('运行时壳完整性校验失败，脚本已停止运行');
  }

  const shellSource = decodePackedText(packed);
  eval(shellSource);
})();
`.trim();

  return header ? `${header}\n\n${protectedLauncher}\n` : `${protectedLauncher}\n`;
}

function buildRemoteCoreShellScript({ code, script, version, runtimeBaseUrl, runtimeSettings }) {
  const extracted = extractUserScriptHeader(code);
  const header = buildRemoteHeader(extracted.header, script, version);
  const body = stripLeadingUserScriptHeaders(extracted.body);
  const shellInfo = buildShellInfo({ mode: 'remote_core', script, version, bodyFingerprint: calcIntegrityChecksum(body || '') });
  const settings = {
    scriptId: script.id,
    scriptName: script.name,
    version: version.version,
    releaseMode: 'remote_core',
    runtimeEnabled: true,
    authMode: script.auth_mode || 'approval',
    usageTrackingEnabled: Number(script.usage_tracking_enabled) === 1,
    heartbeatInterval: Number(runtimeSettings?.heartbeatInterval) || 120,
    offlineGraceMinutes: Number(runtimeSettings?.offlineGraceMinutes) || 30,
    runtimeBaseUrl: runtimeBaseUrl || '',
    fallbackUrls: runtimeSettings?.fallbackUrls || [],
    bindingStrategy: script.binding_strategy || 'browser',
    shellInfo
  };

  const shell = `
const __TM_REMOTE_CORE_CONFIG__ = ${JSON.stringify(settings, null, 2)};
${getRuntimeUiSource()}
${getRuntimeDeviceDescriptorSource()}

async function __tmRemoteCoreStart__() {
  const cfg = __TM_REMOTE_CORE_CONFIG__;
  const runtimeUi = __TM_RUNTIME_UI__;
  runtimeUi.setShellInfo(cfg.shellInfo);
  console.info('[TM Runtime] shell=%s build=%s fp=%s script=%s@%s', cfg.shellInfo?.shellVersion || '-', cfg.shellInfo?.buildId || '-', cfg.shellInfo?.fingerprint || '-', cfg.scriptName || '-', cfg.version || '-');
  const storagePrefix = '__tm_runtime__' + cfg.scriptId + '__';
  const gmGet = typeof GM_getValue === 'function' ? GM_getValue : null;
  const gmSet = typeof GM_setValue === 'function' ? GM_setValue : null;

  const readValue = async (key, fallback = '') => {
    try {
      if (gmGet) {
        const value = await gmGet(storagePrefix + key, fallback);
        return value == null ? fallback : value;
      }
    } catch (error) {}
    try {
      const value = localStorage.getItem(storagePrefix + key);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const writeValue = async (key, value) => {
    try {
      if (gmSet) {
        await gmSet(storagePrefix + key, value);
      }
    } catch (error) {}
    try {
      localStorage.setItem(storagePrefix + key, value);
    } catch (error) {}
  };

  const resolveBaseUrls = () => {
    const list = [];
    if (cfg.runtimeBaseUrl) list.push(cfg.runtimeBaseUrl);
    if (Array.isArray(cfg.fallbackUrls)) cfg.fallbackUrls.forEach(url => url && list.push(url));
    return [...new Set(list.filter(Boolean).map(url => String(url).replace(/\\/$/, '')))];
  };

  const requestJson = async (method, endpoint, payload) => {
    const urls = resolveBaseUrls();
    let lastError = null;
    for (const baseUrl of urls) {
      try {
        const response = await fetch(baseUrl + endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: payload ? JSON.stringify(payload) : undefined
        });
        const json = await response.json().catch(() => ({ code: response.status, message: '响应解析失败' }));
        if (!response.ok || json.code >= 400) {
          lastError = new Error(json.message || ('请求失败: ' + response.status));
          lastError.code = Number(json.code || response.status || 0);
          lastError.httpStatus = Number(response.status || 0);
          lastError.responseMessage = String(json.message || '');
          continue;
        }
        return json;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('运行时服务不可用');
  };

  const shouldClearAuthorizationCode = (error) => {
    const code = Number(error && (error.code || error.httpStatus) || 0);
    const message = String(error && (error.responseMessage || error.message) || '');
    if (!message && !code) return false;
    if (message.includes('授权码无效') || message.includes('授权码不存在') || message.includes('授权码不可用') || message.includes('已过期')) return true;
    if (message.includes('当前授权已停用') || message.includes('授权记录不存在') || message.includes('缺少授权码')) return true;
    if (code === 403 && (message.includes('授权码') || message.includes('已过期') || message.includes('已停用'))) return true;
    return false;
  };

  const deviceInfo = buildRuntimeDeviceInfo();
  let deviceSeed = await readValue('device_seed', '');
  if (!deviceSeed) {
    deviceSeed = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + String(Math.random()).slice(2);
    await writeValue('device_seed', deviceSeed);
  }
  const fingerprintPayload = {
    seed: deviceSeed
  };
  if (cfg.bindingStrategy === 'host') {
    fingerprintPayload.host = location.host || '';
  }
  const deviceFingerprint = JSON.stringify(fingerprintPayload);
  let authorizationCode = await readValue('authorization_code', '');

  if (cfg.authMode !== 'none' && !authorizationCode) {
    runtimeUi.setStatus('当前脚本已启用远程核心。请输入授权码，或提交授权申请。', '');
    const authResult = await runtimeUi.waitForAuthCode('');
    if (authResult.action === 'apply') {
      runtimeUi.setStatus('正在提交授权申请，请填写信息。', '');
      const form = await runtimeUi.waitForApplication();
      if (!form.applicantName) {
        throw new Error('未填写使用人名称，远程核心脚本未启动');
      }
      const utf8ToBase64 = (value) => {
        const text = String(value == null ? '' : value);
        try { return btoa(unescape(encodeURIComponent(text))); } catch (error) { return ''; }
      };
      const requestResult = await requestJson('POST', '/api/runtime/auth-request', {
        scriptId: cfg.scriptId,
        applicantName: form.applicantName,
        applicantNameBase64: utf8ToBase64(form.applicantName),
        contact: form.contact || '',
        contactBase64: utf8ToBase64(form.contact || ''),
        purpose: form.purpose || '',
        purposeBase64: utf8ToBase64(form.purpose || ''),
        remark: form.remark || '',
        remarkBase64: utf8ToBase64(form.remark || ''),
        deviceFingerprint,
        deviceLabel: deviceInfo.label,
        deviceMeta: deviceInfo.meta
      });
      const requestId = requestResult.data && requestResult.data.requestId ? requestResult.data.requestId : null;
      runtimeUi.setStatus((requestResult.message || '授权申请已提交') + '。若管理员已审批，面板会自动提示你输入授权码。', 'success');
      if (requestId) {
        const pollRequestStatus = async () => {
          try {
          const statusResult = await requestJson('GET', '/api/runtime/auth-request/' + requestId + '/status?deviceFingerprint=' + encodeURIComponent(deviceFingerprint));
          const data = statusResult.data || {};
          if (data.status === 'approved') {
              if (data.authorizationCode) {
                await writeValue('authorization_code', data.authorizationCode);
                runtimeUi.showToast('授权申请已审批通过，正在自动激活...', 'success', 1500);
                window.setTimeout(() => window.location.reload(), 1200);
                return;
              }
              runtimeUi.setStatus('授权申请已审批通过，请输入授权码继续。', 'success');
              runtimeUi.openAuthCode(data.authorizationCode || '');
              return;
            }
            if (data.status === 'rejected') {
              runtimeUi.setStatus('授权申请已被拒绝：' + (data.reviewNote || '请联系管理员'), 'error');
              return;
            }
            window.setTimeout(pollRequestStatus, 5000);
          } catch (error) {
            window.setTimeout(pollRequestStatus, 8000);
          }
        };
        window.setTimeout(pollRequestStatus, 5000);
      }
      throw new Error(requestResult.message || '授权申请已提交');
    }
    authorizationCode = String(authResult.value || '').trim();
    if (!authorizationCode) {
      throw new Error('未输入授权码，远程核心脚本未启动');
    }
    await writeValue('authorization_code', authorizationCode.trim());
  }

  if (cfg.authMode !== 'none') {
    runtimeUi.setStatus('正在激活授权并绑定当前设备...', '');
    try {
      await requestJson('POST', '/api/runtime/activate', {
        scriptId: cfg.scriptId,
        authorizationCode,
        deviceFingerprint,
        deviceLabel: deviceInfo.label,
        deviceMeta: deviceInfo.meta
      });
    } catch (error) {
      if (shouldClearAuthorizationCode(error)) {
        await removeValue('authorization_code');
      }
      throw error;
    }
  }

  try {
    await requestJson('POST', '/api/runtime/validate', {
      scriptId: cfg.scriptId,
      version: cfg.version,
      authorizationCode,
      deviceFingerprint,
      deviceLabel: deviceInfo.label,
      runtimeVersion: '1.0.0',
      currentUrl: location.href
    });
  } catch (error) {
    if (shouldClearAuthorizationCode(error)) {
      await removeValue('authorization_code');
    }
    throw error;
  }

  const manifestResponse = await requestJson('GET', '/api/runtime/manifest/' + cfg.scriptId);
  runtimeUi.setStatus('授权成功，正在拉取远程核心模块...', 'success');
  const manifest = manifestResponse.data || {};
  const moduleVersion = manifest.activeModuleVersion || manifest.moduleVersion;
  if (!moduleVersion) {
    throw new Error('远程核心模块版本未发布');
  }

  const moduleUrls = resolveBaseUrls();
  let moduleCode = '';
  let moduleError = null;
  for (const baseUrl of moduleUrls) {
    try {
      const response = await fetch(baseUrl + '/api/runtime/module/' + cfg.scriptId + '/' + moduleVersion);
      if (!response.ok) {
        moduleError = new Error('远程模块拉取失败: ' + response.status);
        continue;
      }
      moduleCode = await response.text();
      break;
    } catch (error) {
      moduleError = error;
    }
  }
  if (!moduleCode) {
    throw moduleError || new Error('远程模块拉取失败');
  }

  function normalizeRemoteModuleCode(source) {
    return String(source || '')
      .replace(/^\\s*export\\s+/gm, '')
      .replace(/(logger\\.info\\('remote core scaffold boot', \\{[\\s\\S]*?\\n\\s*\\}\\))(\\s*\\n\\s*\\()/g, '$1;$2');
  }

  moduleCode = normalizeRemoteModuleCode(moduleCode);

  function evaluateRemoteModuleInSandbox(source) {
    // Direct eval keeps GM_* grants and @require globals in the userscript sandbox.
    const wrappedSource = String(source || '') + '\\n;({ bootstrap: typeof bootstrap === "function" ? bootstrap : null, destroy: typeof destroy === "function" ? destroy : null, getHealth: typeof getHealth === "function" ? getHealth : null });';
    return eval(wrappedSource);
  }

  const isCspEvalError = (error) => {
    const message = String(error && error.message ? error.message : error || '');
    return /unsafe-eval|Content Security Policy|Evaluating a string as JavaScript|Refused to evaluate/i.test(message);
  };

  let remoteModule = null;
  try {
    remoteModule = evaluateRemoteModuleInSandbox(moduleCode);
  } catch (error) {
    if (isCspEvalError(error)) {
      throw new Error('当前网站的 CSP 安全策略禁止远程核心执行动态模块。请重新下载安装最新壳脚本；如果仍然失败，说明该脚本需要 unsafeWindow 或页面主环境，需要人工做兼容处理。原始错误：' + (error && error.message ? error.message : String(error)));
    }
    throw error;
  }
  if (!remoteModule.bootstrap) {
    throw new Error('远程模块缺少 bootstrap 入口');
  }

  const context = {
    script: { id: cfg.scriptId, name: cfg.scriptName, version: cfg.version },
    authorizationCode,
    runtimeConfig: {
      ...manifest.runtimeConfig,
      manifestVersion: manifest.version,
      activeModuleVersion: moduleVersion
    },
    logger: {
      info(message, payload) { console.log('[RemoteCore]', message, payload || ''); },
      warn(message, payload) { console.warn('[RemoteCore]', message, payload || ''); },
      error(message, payload) { console.error('[RemoteCore]', message, payload || ''); },
      debug(message, payload) { console.debug('[RemoteCore]', message, payload || ''); },
      log(message, payload) { console.log('[RemoteCore]', message, payload || ''); },
      trace(message, payload) { console.trace('[RemoteCore]', message, payload || ''); }
    },
    request: async (endpoint, options = {}) => {
      const urls = resolveBaseUrls();
      let lastError = null;
      for (const baseUrl of urls) {
        try {
          const response = await fetch(baseUrl + endpoint, options);
          if (!response.ok) {
            lastError = new Error('请求失败: ' + response.status);
            continue;
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return response.json();
          }
          return response.text();
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('请求失败');
    }
  };

  let sessionToken = '';
  let heartbeatTimer = null;
  if (cfg.usageTrackingEnabled) {
    runtimeUi.setStatus('远程核心授权成功，正在创建运行会话...', 'success');
    const sessionResponse = await requestJson('POST', '/api/runtime/session/start', {
      scriptId: cfg.scriptId,
      authorizationCode,
      deviceFingerprint,
      currentUrl: location.href,
      runtimeVersion: '1.0.0'
    });
    sessionToken = sessionResponse.data?.sessionToken || '';

    if (sessionToken) {
      const sendHeartbeat = async () => {
        try {
          await requestJson('POST', '/api/runtime/session/heartbeat', {
            sessionToken,
            currentUrl: location.href
          });
        } catch (error) {}
      };
      heartbeatTimer = setInterval(sendHeartbeat, Math.max(30000, Number(cfg.heartbeatInterval || 120) * 1000));
      window.addEventListener('beforeunload', function() {
        if (navigator.sendBeacon && cfg.runtimeBaseUrl) {
          try {
            navigator.sendBeacon(cfg.runtimeBaseUrl.replace(/\\/$/, '') + '/api/runtime/session/end', new Blob([
              JSON.stringify({ sessionToken, currentUrl: location.href })
            ], { type: 'application/json' }));
          } catch (error) {}
        }
      });
    }
  }

  try {
    await remoteModule.bootstrap(context);
    runtimeUi.showToast('授权成功，已绑定当前设备并加载远程模块。', 'success', 900);
  } catch (error) {
    if (cfg.usageTrackingEnabled) {
      try {
        await requestJson('POST', '/api/runtime/event', {
          scriptId: cfg.scriptId,
          authorizationCode,
          deviceFingerprint,
          sessionToken,
          eventType: 'runtime_error',
          currentUrl: location.href,
          payload: {
            message: error && error.message ? error.message : String(error)
          }
        });
      } catch (reportError) {}
    }
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}

__tmRemoteCoreStart__().catch(function(error) {
  try {
    const runtimeUi = createRuntimeUi();
    runtimeUi.setStatus(error && error.message ? error.message : String(error), 'error');
  } catch (uiError) {}
  console.error('[RemoteCore]', error);
});
`;

  return header ? `${header}\n\n${shell.trim()}\n` : `${shell.trim()}\n`;
}

module.exports = {
  extractUserScriptHeader,
  collectUserScriptGrants,
  collectUserScriptMetaEntries,
  validateGeneratedWrapperIntegrity,
  buildVerifiedLoaderScript,
  buildRemoteCoreShellScript
};
