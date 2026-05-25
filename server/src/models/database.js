const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// 确保数据目录存在
const dataDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.resolve(config.dbPath));

// 启用外键约束
db.pragma('foreign_keys = ON');

// 初始化数据库表
function initDatabase() {
  // 管理员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 分类表
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 脚本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER,
      current_version TEXT,
      is_private INTEGER DEFAULT 0,
      show_in_list INTEGER DEFAULT 1,
      access_password TEXT,
      enable_obfuscation INTEGER DEFAULT 0,
      release_mode TEXT DEFAULT 'direct_obfuscated',
      auth_mode TEXT DEFAULT 'none',
      runtime_enabled INTEGER DEFAULT 0,
      allow_device_binding INTEGER DEFAULT 0,
      binding_strategy TEXT DEFAULT 'browser',
      default_device_limit INTEGER DEFAULT 1,
      usage_tracking_enabled INTEGER DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  // 脚本版本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS script_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      changelog TEXT,
      file_path TEXT NOT NULL,
      obfuscated_file_path TEXT,
      loader_file_path TEXT,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_runtime_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      runtime_base_url TEXT,
      manifest_url TEXT,
      fallback_urls TEXT,
      heartbeat_interval INTEGER DEFAULT 120,
      offline_grace_minutes INTEGER DEFAULT 30,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_auth_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      applicant_name TEXT NOT NULL,
      contact TEXT,
      purpose TEXT,
      remark TEXT,
      device_fingerprint TEXT,
      device_label TEXT,
      status TEXT DEFAULT 'pending',
      review_note TEXT,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      authorization_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (authorization_id) REFERENCES script_authorizations(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      authorization_code TEXT NOT NULL UNIQUE,
      applicant_name TEXT NOT NULL,
      contact TEXT,
      purpose TEXT,
      remark TEXT,
      status TEXT DEFAULT 'approved',
      device_limit INTEGER DEFAULT 1,
      allow_rebind INTEGER DEFAULT 1,
      starts_at DATETIME,
      expires_at DATETIME,
      last_activated_at DATETIME,
      last_active_at DATETIME,
      approved_by TEXT,
      review_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_authorization_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authorization_id INTEGER NOT NULL,
      script_id INTEGER NOT NULL,
      device_fingerprint TEXT NOT NULL,
      device_label TEXT,
      device_meta TEXT,
      status TEXT DEFAULT 'active',
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (authorization_id) REFERENCES script_authorizations(id) ON DELETE CASCADE,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_runtime_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      authorization_id INTEGER,
      device_id INTEGER,
      session_token TEXT NOT NULL UNIQUE,
      runtime_version TEXT,
      current_url TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (authorization_id) REFERENCES script_authorizations(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES script_authorization_devices(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      authorization_id INTEGER,
      device_id INTEGER,
      session_id INTEGER,
      event_type TEXT NOT NULL,
      event_payload TEXT,
      current_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (authorization_id) REFERENCES script_authorizations(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES script_authorization_devices(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES script_runtime_sessions(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_remote_manifests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      manifest_json TEXT NOT NULL,
      remote_config_json TEXT,
      active_module_version TEXT,
      description TEXT,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(script_id, version),
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS script_remote_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      module_name TEXT NOT NULL,
      description TEXT,
      entry_name TEXT DEFAULT 'bootstrap',
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(script_id, version),
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
    )
  `);

  // 油猴插件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      browser_type TEXT,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      is_recommended INTEGER DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 小程序表
  db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      is_recommended INTEGER DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 下载统计表
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      country TEXT,
      city TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 网站配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步节点表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      direction TEXT DEFAULT 'pull',
      sync_interval INTEGER DEFAULT 1440,
      last_sync_at DATETIME,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      node_name TEXT,
      direction TEXT,
      status TEXT NOT NULL,
      details TEXT,
      categories_synced INTEGER DEFAULT 0,
      scripts_synced INTEGER DEFAULT 0,
      versions_synced INTEGER DEFAULT 0,
      plugins_synced INTEGER DEFAULT 0,
      files_synced INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES sync_nodes(id) ON DELETE CASCADE
    )
  `);

  // 更新日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_version TEXT,
      to_version TEXT,
      status TEXT NOT NULL,
      details TEXT,
      files_updated INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scripts_category ON scripts(category_id);
    CREATE INDEX IF NOT EXISTS idx_script_versions_script ON script_versions(script_id);
    CREATE INDEX IF NOT EXISTS idx_download_stats_target ON download_stats(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_download_stats_date ON download_stats(created_at);
    CREATE INDEX IF NOT EXISTS idx_auth_requests_script_status ON script_auth_requests(script_id, status);
    CREATE INDEX IF NOT EXISTS idx_authorizations_script_status ON script_authorizations(script_id, status);
    CREATE INDEX IF NOT EXISTS idx_authorization_devices_auth ON script_authorization_devices(authorization_id, status);
    CREATE INDEX IF NOT EXISTS idx_runtime_sessions_script_status ON script_runtime_sessions(script_id, status);
    CREATE INDEX IF NOT EXISTS idx_runtime_events_script_type ON script_runtime_events(script_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_remote_manifests_script_status ON script_remote_manifests(script_id, status);
    CREATE INDEX IF NOT EXISTS idx_remote_modules_script_status ON script_remote_modules(script_id, status);
  `);

  // 数据库迁移：为已存在的表添加新字段
  const migrateDatabase = () => {
    // 检查 scripts 表是否有 show_in_list 字段
    const scriptsColumns = db.prepare("PRAGMA table_info(scripts)").all();
    const hasShowInList = scriptsColumns.some(col => col.name === 'show_in_list');
    const hasEnableObfuscation = scriptsColumns.some(col => col.name === 'enable_obfuscation');
    const hasReleaseMode = scriptsColumns.some(col => col.name === 'release_mode');
    const hasAuthMode = scriptsColumns.some(col => col.name === 'auth_mode');
    const hasRuntimeEnabled = scriptsColumns.some(col => col.name === 'runtime_enabled');
    const hasAllowDeviceBinding = scriptsColumns.some(col => col.name === 'allow_device_binding');
    const hasBindingStrategy = scriptsColumns.some(col => col.name === 'binding_strategy');
    const hasDefaultDeviceLimit = scriptsColumns.some(col => col.name === 'default_device_limit');
    const hasUsageTrackingEnabled = scriptsColumns.some(col => col.name === 'usage_tracking_enabled');

    if (!hasShowInList) {
      db.exec('ALTER TABLE scripts ADD COLUMN show_in_list INTEGER DEFAULT 1');
      console.log('已添加 scripts.show_in_list 字段');
    }

    if (!hasEnableObfuscation) {
      db.exec('ALTER TABLE scripts ADD COLUMN enable_obfuscation INTEGER DEFAULT 0');
      console.log('已添加 scripts.enable_obfuscation 字段');
    }

    if (!hasReleaseMode) {
      db.exec("ALTER TABLE scripts ADD COLUMN release_mode TEXT DEFAULT 'direct_obfuscated'");
      console.log('已添加 scripts.release_mode 字段');
    }

    if (!hasAuthMode) {
      db.exec("ALTER TABLE scripts ADD COLUMN auth_mode TEXT DEFAULT 'none'");
      console.log('已添加 scripts.auth_mode 字段');
    }

    if (!hasRuntimeEnabled) {
      db.exec('ALTER TABLE scripts ADD COLUMN runtime_enabled INTEGER DEFAULT 0');
      console.log('已添加 scripts.runtime_enabled 字段');
    }

    if (!hasAllowDeviceBinding) {
      db.exec('ALTER TABLE scripts ADD COLUMN allow_device_binding INTEGER DEFAULT 0');
      console.log('已添加 scripts.allow_device_binding 字段');
    }

    if (!hasBindingStrategy) {
      db.exec("ALTER TABLE scripts ADD COLUMN binding_strategy TEXT DEFAULT 'browser'");
      console.log('已添加 scripts.binding_strategy 字段');
    }

    if (!hasDefaultDeviceLimit) {
      db.exec('ALTER TABLE scripts ADD COLUMN default_device_limit INTEGER DEFAULT 1');
      console.log('已添加 scripts.default_device_limit 字段');
    }

    if (!hasUsageTrackingEnabled) {
      db.exec('ALTER TABLE scripts ADD COLUMN usage_tracking_enabled INTEGER DEFAULT 0');
      console.log('已添加 scripts.usage_tracking_enabled 字段');
    }

    // 检查 script_versions 表是否有 obfuscated_file_path 字段
    const versionsColumns = db.prepare("PRAGMA table_info(script_versions)").all();
    const hasObfuscatedPath = versionsColumns.some(col => col.name === 'obfuscated_file_path');
    const hasLoaderPath = versionsColumns.some(col => col.name === 'loader_file_path');

    if (!hasObfuscatedPath) {
      db.exec('ALTER TABLE script_versions ADD COLUMN obfuscated_file_path TEXT');
      console.log('已添加 script_versions.obfuscated_file_path 字段');
    }

    if (!hasLoaderPath) {
      db.exec('ALTER TABLE script_versions ADD COLUMN loader_file_path TEXT');
      console.log('已添加 script_versions.loader_file_path 字段');
    }

    const syncLogsColumns = db.prepare("PRAGMA table_info(sync_logs)").all();
    const hasProgramsSynced = syncLogsColumns.some(col => col.name === 'programs_synced');
    const authRequestColumns = db.prepare("PRAGMA table_info(script_auth_requests)").all();
    const hasAuthRequestDeviceMeta = authRequestColumns.some(col => col.name === 'device_meta');

    if (!hasProgramsSynced) {
      db.exec('ALTER TABLE sync_logs ADD COLUMN programs_synced INTEGER DEFAULT 0');
      console.log('已添加 sync_logs.programs_synced 字段');
    }

    if (!hasAuthRequestDeviceMeta) {
      db.exec('ALTER TABLE script_auth_requests ADD COLUMN device_meta TEXT');
      console.log('已添加 script_auth_requests.device_meta 字段');
    }

    db.prepare("UPDATE scripts SET release_mode = 'direct_obfuscated' WHERE release_mode IS NULL OR TRIM(release_mode) = ''").run();
    db.prepare("UPDATE scripts SET auth_mode = 'none' WHERE auth_mode IS NULL OR TRIM(auth_mode) = ''").run();
    db.prepare('UPDATE scripts SET runtime_enabled = COALESCE(runtime_enabled, 0)').run();
    db.prepare('UPDATE scripts SET allow_device_binding = COALESCE(allow_device_binding, 0)').run();
    db.prepare("UPDATE scripts SET binding_strategy = 'browser' WHERE binding_strategy IS NULL OR TRIM(binding_strategy) = ''").run();
    db.prepare('UPDATE scripts SET default_device_limit = COALESCE(default_device_limit, 1)').run();
    db.prepare('UPDATE scripts SET usage_tracking_enabled = COALESCE(usage_tracking_enabled, 0)').run();
  };

  migrateDatabase();

  // 初始化默认网站配置
  const configKeys = Object.keys(config.defaultSiteConfig);
  const insertConfig = db.prepare('INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)');
  configKeys.forEach(key => {
    insertConfig.run(key, config.defaultSiteConfig[key]);
  });
  insertConfig.run('runtime_base_url', '');
  insertConfig.run('runtime_manifest_url', '');
  insertConfig.run('runtime_fallback_urls', '[]');
  insertConfig.run('runtime_heartbeat_interval', '120');
  insertConfig.run('runtime_offline_grace_minutes', '30');
  insertConfig.run('setup_completed', '0');

  const defaultRuntimeProfile = db.prepare('SELECT id FROM script_runtime_profiles WHERE is_default = 1 LIMIT 1').get();
  if (!defaultRuntimeProfile) {
    db.prepare(`
      INSERT INTO script_runtime_profiles (
        name, runtime_base_url, manifest_url, fallback_urls, heartbeat_interval, offline_grace_minutes, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run('默认运行时', '', '', '[]', 120, 30);
  }

  // 初始化默认分类
  const categoryExists = db.prepare('SELECT id FROM categories LIMIT 1').get();
  if (!categoryExists) {
    const insertCategory = db.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)');
    insertCategory.run('工具脚本', '实用工具类脚本', 1);
    insertCategory.run('视频脚本', '视频网站增强脚本', 2);
    insertCategory.run('购物脚本', '电商购物辅助脚本', 3);
    insertCategory.run('其他脚本', '其他类型脚本', 99);
    console.log('默认分类已创建');
  }

  // 服务启动时，将未完成的重启日志标记为完成（说明重启成功了）
  const restartingLogs = db.prepare("UPDATE update_logs SET status = 'completed', details = '重启完成' WHERE status = 'restarting'").run();
  if (restartingLogs.changes > 0) {
    console.log(`已更新 ${restartingLogs.changes} 条重启日志状态`);
  }

  console.log('数据库初始化完成');
}

// 执行初始化
initDatabase();

module.exports = db;
