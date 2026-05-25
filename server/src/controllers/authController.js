const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const config = require('../config');

function getSetupState() {
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin').get().count;
  const setupConfig = db.prepare("SELECT value FROM site_config WHERE key = 'setup_completed'").get();
  return {
    completed: adminCount > 0 || setupConfig?.value === '1',
    adminCount
  };
}

function normalizeText(value, fallback = '') {
  return String(value == null ? fallback : value).trim();
}

exports.getSetupStatus = (req, res) => {
  const state = getSetupState();
  res.json({
    code: 200,
    data: {
      setupRequired: !state.completed,
      completed: state.completed
    }
  });
};

exports.setup = (req, res) => {
  const state = getSetupState();
  if (state.completed) {
    return res.status(409).json({ code: 409, message: '系统已经完成初始化' });
  }

  const payload = req.body || {};
  const siteTitle = normalizeText(payload.siteTitle, config.defaultSiteConfig.title);
  const shortName = normalizeText(payload.shortName, config.defaultSiteConfig.shortName).slice(0, 4);
  const description = normalizeText(payload.description, config.defaultSiteConfig.description);
  const footer = normalizeText(payload.footer, `${siteTitle} - 让安装和分发更简单`);
  const announcement = normalizeText(payload.announcement, '');
  const username = normalizeText(payload.username);
  const password = String(payload.password || '');

  if (!siteTitle) {
    return res.status(400).json({ code: 400, message: '平台名称不能为空' });
  }
  if (!username || username.length < 3 || username.length > 32) {
    return res.status(400).json({ code: 400, message: '管理员用户名长度需为 3-32 个字符' });
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ code: 400, message: '管理员用户名只能包含字母、数字、下划线、点和短横线' });
  }
  if (password.length < 8) {
    return res.status(400).json({ code: 400, message: '管理员密码长度不能少于 8 位' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const upsertConfig = db.prepare(`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)').run(username, hashedPassword);
    upsertConfig.run('title', siteTitle);
    upsertConfig.run('shortName', shortName || config.defaultSiteConfig.shortName);
    upsertConfig.run('description', description);
    upsertConfig.run('footer', footer);
    upsertConfig.run('announcement', announcement);
    upsertConfig.run('setup_completed', '1');
  });

  try {
    tx();
    const admin = db.prepare('SELECT id, username FROM admin WHERE username = ?').get(username);
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    res.json({
      code: 200,
      message: '初始化完成',
      data: {
        token,
        username: admin.username
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message || '初始化失败' });
  }
};

// 管理员登录
exports.login = (req, res) => {
  const state = getSetupState();
  if (!state.completed) {
    return res.status(428).json({ code: 428, message: '系统尚未初始化，请先完成部署引导', data: { setupRequired: true } });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
  }

  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);

  if (!admin) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }

  const isValidPassword = bcrypt.compareSync(password, admin.password);

  if (!isValidPassword) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.json({
    code: 200,
    message: '登录成功',
    data: {
      token,
      username: admin.username
    }
  });
};

// 获取当前管理员信息
exports.getProfile = (req, res) => {
  const admin = db.prepare('SELECT id, username, created_at FROM admin WHERE id = ?').get(req.admin.id);

  if (!admin) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  res.json({
    code: 200,
    data: admin
  });
};

// 修改密码
exports.changePassword = (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码长度不能少于6位' });
  }

  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.admin.id);

  if (!bcrypt.compareSync(oldPassword, admin.password)) {
    return res.status(400).json({ code: 400, message: '旧密码错误' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, req.admin.id);

  res.json({ code: 200, message: '密码修改成功' });
};
