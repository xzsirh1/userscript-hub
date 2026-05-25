const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '..', 'xuexi.user.js');
const outDir = path.resolve(__dirname, '..', 'docs', 'examples', 'remote-core', 'xuexi');

if (!fs.existsSync(srcPath)) {
  throw new Error(`未找到源脚本: ${srcPath}`);
}

fs.mkdirSync(outDir, { recursive: true });

let code = fs.readFileSync(srcPath, 'utf8');

function replaceOrThrow(source, searchValue, replaceValue, label) {
  if (!source.includes(searchValue)) {
    throw new Error(`未找到待替换片段: ${label}`);
  }
  return source.replace(searchValue, replaceValue);
}

code = code.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
code = code.replace(/^\s*\(function\(\)\s*\{\s*\n\s*'use strict';\s*/, '');
code = code.replace(/\n?\s*\}\)\(\);\s*$/, '\n');
code = code.replace("const VERSION = '20.0';", "const VERSION = remoteConfig.appVersion || '20.0-remote';");
code = code.replace("const ORIGIN = 'https://mooc.ctt.cn';", "const ORIGIN = remoteConfig.origin || 'https://mooc.ctt.cn';");
code = replaceOrThrow(
  code,
  "const STORAGE_KEYS = {\n        settings: 'microscope_v20_settings',\n        queue: 'microscope_v20_queue',\n        ui: 'microscope_v20_ui',\n        logs: 'microscope_v20_logs'\n    };",
  "const STORAGE_KEYS = Object.assign({\n        settings: 'microscope_v20_settings',\n        queue: 'microscope_v20_queue',\n        ui: 'microscope_v20_ui',\n        logs: 'microscope_v20_logs'\n    }, remoteConfig.storageKeys || {});\n\n    const SELECTORS = Object.assign({\n        subjectLinks: 'a[href*=\"/study/subject/detail/\"]',\n        subjectTitle: '.title, .text-overflow.title, .t-name',\n        chapterLegacy: '.section-item',\n        chapterLegacyFocus: '.focus',\n        chapterLegacyItemFocus: '.item.sub-text.focus',\n        chapterModern: 'dl.chapter-list-box',\n        bigPlayButton: '.vjs-big-play-button',\n        fallbackPlayButton: '.u-player-start-btn',\n        finishStatusState: '.finishStatus-state',\n        currentHover: '.catalog-state-info .current-hover',\n        specialLampText: '.special-lamp-text',\n        specialLampBar: '.special-lamp-bar',\n        actionButton: '.small.inline-block',\n        shareCollect: '.share-collect',\n        bannerInfo: '.banner-info',\n        titleName: '.t-name'\n    }, remoteConfig.selectors || {});\n\n    const COPY = Object.assign({\n        panelKicker: 'Microscope ' + VERSION,\n        panelTitle: '全专题巡学版',\n        panelSubtitle: '保留 v18.0 的稳态学习逻辑，只在前面增加专题扫描、未完成队列和顺序调度。',\n        queueBadge: '队列',\n        currentTaskTitle: '当前任务',\n        currentTaskPlaceholder: '尚未开始扫描专题。',\n        actionScan: '扫描专题',\n        actionScanStart: '扫描并学习',\n        actionResume: '开始队列',\n        actionPause: '暂停队列',\n        actionExport: '导出队列',\n        actionClear: '清空队列',\n        queueTitle: '专题队列',\n        queueWaiting: '等待扫描',\n        queueFilterLabel: '状态',\n        queueFilterAll: '全部',\n        queueFilterPending: '只看未完成',\n        queueFilterCompleted: '只看已完成',\n        queueSortLabel: '排序',\n        queueSortOrder: '按原顺序',\n        queueSortHourDesc: '按学时降序',\n        logsTitle: '运行日志',\n        logsLatestPrefix: '最新 ',\n        startupLog: '已启动 v' + VERSION + ' | 学习内核沿用 v18.0'\n    }, remoteConfig.copy || {});",
  'storage selectors copy block'
);
code = code.replace('const DEFAULT_SETTINGS = {', 'const DEFAULT_SETTINGS = Object.assign({');
code = code.replace(
  /\n\s*};\n\n\s*const DEFAULT_UI = \{/,
  '\n    }, remoteConfig.settings || {});\n\n    const DEFAULT_UI = Object.assign({'
);
code = code.replace(
  /\n\s*};\n\n\s*let settings = loadJson\(STORAGE_KEYS\.settings, DEFAULT_SETTINGS\);/,
  '\n    }, remoteConfig.uiDefaults || {});\n\n    let settings = loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);'
);
code = code.replace('window.__zxyMicroscopeV20 = {', 'window.__zxyMicroscopeRemoteV20 = {');
code = replaceOrThrow(code, "log('已启动 v' + VERSION + ' | 学习内核沿用 v18.0');", "log(COPY.startupLog);", 'startup log');
code = replaceOrThrow(code, "'      <div class=\"v20-kicker\">Microscope ' + escapeHtml(VERSION) + '</div>' +", "'      <div class=\"v20-kicker\">' + escapeHtml(COPY.panelKicker) + '</div>' +", 'panel kicker');
code = replaceOrThrow(code, "'      <div class=\"v20-title\">全专题巡学版</div>' +", "'      <div class=\"v20-title\">' + escapeHtml(COPY.panelTitle) + '</div>' +", 'panel title');
code = replaceOrThrow(code, "'      <div class=\"v20-subtitle\">保留 v18.0 的稳态学习逻辑，只在前面增加专题扫描、未完成队列和顺序调度。</div>' +", "'      <div class=\"v20-subtitle\">' + escapeHtml(COPY.panelSubtitle) + '</div>' +", 'panel subtitle');
code = replaceOrThrow(code, "'  <div class=\"v20-mini-badge\">队列 <span data-role=\"mini-badge\">0 / 0</span></div>' +", "'  <div class=\"v20-mini-badge\">' + escapeHtml(COPY.queueBadge) + ' <span data-role=\"mini-badge\">0 / 0</span></div>' +", 'queue badge');
code = replaceOrThrow(code, "'    <div class=\"v20-current-title\">当前任务</div>' +", "'    <div class=\"v20-current-title\">' + escapeHtml(COPY.currentTaskTitle) + '</div>' +", 'current task title');
code = replaceOrThrow(code, "'    <div class=\"v20-current-text\" data-role=\"current\">尚未开始扫描专题。</div>' +", "'    <div class=\"v20-current-text\" data-role=\"current\">' + escapeHtml(COPY.currentTaskPlaceholder) + '</div>' +", 'current task placeholder');
code = replaceOrThrow(code, "'    <button class=\"v20-btn gold\" data-action=\"scan\">扫描专题</button>' +", "'    <button class=\"v20-btn gold\" data-action=\"scan\">' + escapeHtml(COPY.actionScan) + '</button>' +", 'scan button');
code = replaceOrThrow(code, "'    <button class=\"v20-btn primary\" data-action=\"scan-start\">扫描并学习</button>' +", "'    <button class=\"v20-btn primary\" data-action=\"scan-start\">' + escapeHtml(COPY.actionScanStart) + '</button>' +", 'scan start button');
code = replaceOrThrow(code, "'    <button class=\"v20-btn sky\" data-action=\"resume\">开始队列</button>' +", "'    <button class=\"v20-btn sky\" data-action=\"resume\">' + escapeHtml(COPY.actionResume) + '</button>' +", 'resume button');
code = replaceOrThrow(code, "'    <button class=\"v20-btn muted\" data-action=\"pause\">暂停队列</button>' +", "'    <button class=\"v20-btn muted\" data-action=\"pause\">' + escapeHtml(COPY.actionPause) + '</button>' +", 'pause button');
code = replaceOrThrow(code, "'    <button class=\"v20-btn sky\" data-action=\"export\">导出队列</button>' +", "'    <button class=\"v20-btn sky\" data-action=\"export\">' + escapeHtml(COPY.actionExport) + '</button>' +", 'export button');
code = replaceOrThrow(code, "'    <button class=\"v20-btn muted\" data-action=\"clear\">清空队列</button>' +", "'    <button class=\"v20-btn muted\" data-action=\"clear\">' + escapeHtml(COPY.actionClear) + '</button>' +", 'clear button');
code = replaceOrThrow(code, "'      <span>专题队列</span>' +", "'      <span>' + escapeHtml(COPY.queueTitle) + '</span>' +", 'queue title');
code = replaceOrThrow(code, "'      <span class=\"v20-section-sub\" data-role=\"queue-sub\">等待扫描</span>' +", "'      <span class=\"v20-section-sub\" data-role=\"queue-sub\">' + escapeHtml(COPY.queueWaiting) + '</span>' +", 'queue waiting');
code = replaceOrThrow(code, "'        <span class=\"v20-chip-label\">状态</span>' +", "'        <span class=\"v20-chip-label\">' + escapeHtml(COPY.queueFilterLabel) + '</span>' +", 'queue filter label');
code = replaceOrThrow(code, "'          <button class=\"v20-chip\" data-filter=\"all\">全部</button>' +", "'          <button class=\"v20-chip\" data-filter=\"all\">' + escapeHtml(COPY.queueFilterAll) + '</button>' +", 'queue filter all');
code = replaceOrThrow(code, "'          <button class=\"v20-chip\" data-filter=\"pending\">只看未完成</button>' +", "'          <button class=\"v20-chip\" data-filter=\"pending\">' + escapeHtml(COPY.queueFilterPending) + '</button>' +", 'queue filter pending');
code = replaceOrThrow(code, "'          <button class=\"v20-chip\" data-filter=\"completed\">只看已完成</button>' +", "'          <button class=\"v20-chip\" data-filter=\"completed\">' + escapeHtml(COPY.queueFilterCompleted) + '</button>' +", 'queue filter completed');
code = replaceOrThrow(code, "'        <span class=\"v20-chip-label\">排序</span>' +", "'        <span class=\"v20-chip-label\">' + escapeHtml(COPY.queueSortLabel) + '</span>' +", 'queue sort label');
code = replaceOrThrow(code, "'          <button class=\"v20-chip\" data-sort=\"order\">按原顺序</button>' +", "'          <button class=\"v20-chip\" data-sort=\"order\">' + escapeHtml(COPY.queueSortOrder) + '</button>' +", 'queue sort order');
code = replaceOrThrow(code, "'          <button class=\"v20-chip\" data-sort=\"hourDesc\">按学时降序</button>' +", "'          <button class=\"v20-chip\" data-sort=\"hourDesc\">' + escapeHtml(COPY.queueSortHourDesc) + '</button>' +", 'queue sort hour');
code = replaceOrThrow(code, "'      <span>运行日志</span>' +", "'      <span>' + escapeHtml(COPY.logsTitle) + '</span>' +", 'logs title');
code = replaceOrThrow(code, "'      <span class=\"v20-section-sub\">最新 ' + settings.logsLimit + ' 条</span>' +", "'      <span class=\"v20-section-sub\">' + escapeHtml(COPY.logsLatestPrefix) + settings.logsLimit + ' 条</span>' +", 'logs latest');
code = replaceOrThrow(code, "document.querySelectorAll('a[href*=\"/study/subject/detail/\"]')", 'document.querySelectorAll(SELECTORS.subjectLinks)', 'subject links selector all');
code = replaceOrThrow(code, "card.querySelector('.title, .text-overflow.title, .t-name') || link.querySelector('.title') || link", "card.querySelector(SELECTORS.subjectTitle) || link.querySelector('.title') || link", 'subject title selector');
code = replaceOrThrow(code, "const legacyItems = Array.from(document.querySelectorAll('.section-item'));", "const legacyItems = Array.from(document.querySelectorAll(SELECTORS.chapterLegacy));", 'legacy chapter selector');
code = replaceOrThrow(code, "return !!item.querySelector('.focus') || item.classList.contains('active') || !!item.querySelector('.item.sub-text.focus');", "return !!item.querySelector(SELECTORS.chapterLegacyFocus) || item.classList.contains('active') || !!item.querySelector(SELECTORS.chapterLegacyItemFocus);", 'legacy focus selectors');
code = replaceOrThrow(code, "const modernItems = Array.from(document.querySelectorAll('dl.chapter-list-box'));", "const modernItems = Array.from(document.querySelectorAll(SELECTORS.chapterModern));", 'modern chapter selector');
code = replaceOrThrow(code, "const finishStatusText = firstNonEmpty([\n            getNodeText(doc.querySelector('.finishStatus-state')),\n            getNodeText(doc.querySelector('.catalog-state-info .current-hover'))\n        ]);", "const finishStatusText = firstNonEmpty([\n            getNodeText(doc.querySelector(SELECTORS.finishStatusState)),\n            getNodeText(doc.querySelector(SELECTORS.currentHover))\n        ]);", 'finish status selectors');
code = replaceOrThrow(code, "const summaryText = getNodeText(doc.querySelector('.special-lamp-text'));", "const summaryText = getNodeText(doc.querySelector(SELECTORS.specialLampText));", 'summary selector');
code = replaceOrThrow(code, "const progressText = getNodeText(doc.querySelector('.special-lamp-bar'));", "const progressText = getNodeText(doc.querySelector(SELECTORS.specialLampBar));", 'progress selector');
code = replaceOrThrow(code, "const buttonTexts = Array.from(doc.querySelectorAll('.small.inline-block')).map(function(node) {", "const buttonTexts = Array.from(doc.querySelectorAll(SELECTORS.actionButton)).map(function(node) {", 'action button selector');
code = replaceOrThrow(code, "extractHourFromText(getNodeText(doc.querySelector('.share-collect'))),", "extractHourFromText(getNodeText(doc.querySelector(SELECTORS.shareCollect))),", 'share collect selector');
code = replaceOrThrow(code, "extractHourFromText(getNodeText(doc.querySelector('.banner-info')))", "extractHourFromText(getNodeText(doc.querySelector(SELECTORS.bannerInfo)))", 'banner info selector');
code = replaceOrThrow(code, "getNodeText(doc.querySelector('.t-name')),", "getNodeText(doc.querySelector(SELECTORS.titleName)),", 'title name selector');
code = replaceOrThrow(code, "const bigBtn = document.querySelector('.vjs-big-play-button') || document.querySelector('.u-player-start-btn');", "const bigBtn = document.querySelector(SELECTORS.bigPlayButton) || document.querySelector(SELECTORS.fallbackPlayButton);", 'play button selectors');

const banner = `function createSafeLogger(sourceLogger) {
    const fallbackLogger = typeof console !== 'undefined' ? console : {};
    const make = (level) => (...args) => {
        const candidate = sourceLogger && typeof sourceLogger[level] === 'function' ? sourceLogger[level].bind(sourceLogger) : null;
        const fallback = typeof fallbackLogger[level] === 'function'
            ? fallbackLogger[level].bind(fallbackLogger)
            : (typeof fallbackLogger.log === 'function' ? fallbackLogger.log.bind(fallbackLogger) : null);
        const fn = candidate || fallback;
        if (!fn) return;
        try {
            fn(...args);
        } catch (error) {}
    };

    return {
        info: make('info'),
        warn: make('warn'),
        error: make('error'),
        debug: make('debug'),
        log: make('log'),
        trace: make('trace')
    };
}

async function bootstrap(context) {
    const remoteConfig = context.runtimeConfig || {};
    const logger = createSafeLogger(context.logger);
    const featureFlags = remoteConfig.featureFlags || {};
    const bootKey = '__zxyMicroscopeRemoteV20Booted__';
    if (window[bootKey]) {
        logger.info('xuexi remote core already booted');
        return;
    }
    window[bootKey] = true;
`;

const footer = `
}

async function destroy(context) {
    const bootKey = '__zxyMicroscopeRemoteV20Booted__';
    delete window[bootKey];
    if (window.__zxyMicroscopeRemoteV20) {
        delete window.__zxyMicroscopeRemoteV20;
    }
    const logger = createSafeLogger(context.logger);
    logger.info('xuexi remote core destroyed');
}

function getHealth() {
    return {
        ok: true,
        module: 'xuexi-remote-core',
        timestamp: new Date().toISOString()
    };
}
`;

const finalCode = banner + code.replace(/^/gm, '    ') + footer;

const manifest = {
  site: 'mooc.ctt.cn',
  module: 'xuexi.remote-core',
  appVersion: '20.0-remote',
  notes: '第一例 remote_core 实战改造：保留页面学习内核，配置和版本切换由后台控制',
  routes: {
    subjectIndex: '/#/studyPartySchool/subject/index',
    subjectDetail: '/study/subject/detail/',
    course: '/course/'
  }
};

const runtimeConfig = {
  appVersion: '20.0-remote',
  origin: 'https://mooc.ctt.cn',
  settings: {
    rate: 1.0,
    checkInterval: 2000,
    waitAfterEnd: 3000,
    maxSwitchAttempts: 5,
    actionCooldown: 2200,
    iframeTimeout: 18000,
    iframePollInterval: 450,
    navDelay: 900,
    returnDelay: 1000,
    keepAlive: true,
    queueAutoStartAfterScan: true,
    logsLimit: 160,
    sourcePageFallback: 'https://mooc.ctt.cn/#/studyPartySchool/subject/index'
  },
  uiDefaults: {
    collapsed: false,
    left: '',
    top: '',
    filterStatus: 'all',
    sortMode: 'order'
  },
  featureFlags: {
    enableScan: true,
    enableQueueAutoStart: true,
    enableExport: true,
    enableKeepAlive: true
  },
  selectors: {
    subjectLinks: 'a[href*="/study/subject/detail/"]',
    subjectTitle: '.title, .text-overflow.title, .t-name',
    chapterLegacy: '.section-item',
    chapterLegacyFocus: '.focus',
    chapterLegacyItemFocus: '.item.sub-text.focus',
    chapterModern: 'dl.chapter-list-box',
    bigPlayButton: '.vjs-big-play-button',
    fallbackPlayButton: '.u-player-start-btn',
    finishStatusState: '.finishStatus-state',
    currentHover: '.catalog-state-info .current-hover',
    specialLampText: '.special-lamp-text',
    specialLampBar: '.special-lamp-bar',
    actionButton: '.small.inline-block',
    shareCollect: '.share-collect',
    bannerInfo: '.banner-info',
    titleName: '.t-name'
  },
  copy: {
    panelKicker: 'Microscope 20.0 Remote',
    panelTitle: '全专题巡学版',
    panelSubtitle: '通过远程核心下发学习配置与界面文案，保留本地页面执行能力。',
    queueBadge: '队列',
    currentTaskTitle: '当前任务',
    currentTaskPlaceholder: '尚未开始扫描专题。',
    actionScan: '扫描专题',
    actionScanStart: '扫描并学习',
    actionResume: '开始队列',
    actionPause: '暂停队列',
    actionExport: '导出队列',
    actionClear: '清空队列',
    queueTitle: '专题队列',
    queueWaiting: '等待扫描',
    queueFilterLabel: '状态',
    queueFilterAll: '全部',
    queueFilterPending: '只看未完成',
    queueFilterCompleted: '只看已完成',
    queueSortLabel: '排序',
    queueSortOrder: '按原顺序',
    queueSortHourDesc: '按学时降序',
    logsTitle: '运行日志',
    logsLatestPrefix: '最新 '
  }
};

fs.writeFileSync(path.join(outDir, 'xuexi.remote-core.module.js'), finalCode, 'utf8');
fs.writeFileSync(path.join(outDir, 'xuexi.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'xuexi.runtime-config.json'), JSON.stringify(runtimeConfig, null, 2), 'utf8');

console.log(JSON.stringify({ outDir }, null, 2));
