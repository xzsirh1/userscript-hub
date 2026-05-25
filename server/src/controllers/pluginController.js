const db = require('../models/database');
const path = require('path');
const fs = require('fs');

// 获取插件列表
exports.getPlugins = (req, res) => {
  const plugins = db.prepare(`
    SELECT * FROM plugins ORDER BY is_recommended DESC, created_at DESC
  `).all();

  res.json({ code: 200, data: plugins });
};

// 获取单个插件
exports.getPlugin = (req, res) => {
  const { id } = req.params;
  const plugin = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);

  if (!plugin) {
    return res.status(404).json({ code: 404, message: '插件不存在' });
  }

  res.json({ code: 200, data: plugin });
};

// 上传插件
exports.uploadPlugin = (req, res) => {
  const { name, description, version, browser_type, is_recommended } = req.body;

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传插件文件' });
  }

  if (!name) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: '插件名称不能为空' });
  }

  // 根据文件扩展名判断浏览器类型
  const ext = path.extname(req.file.originalname).toLowerCase();
  let detectedBrowser = browser_type;
  if (!detectedBrowser) {
    if (ext === '.crx') {
      detectedBrowser = 'chrome';
    } else if (ext === '.xpi') {
      detectedBrowser = 'firefox';
    }
  }

  const result = db.prepare(`
    INSERT INTO plugins (name, description, version, browser_type, file_path, file_size, is_recommended)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || '',
    version || '1.0.0',
    detectedBrowser || 'chrome',
    req.file.path,
    req.file.size,
    is_recommended ? 1 : 0
  );

  const plugin = db.prepare('SELECT * FROM plugins WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '上传成功', data: plugin });
};

// 更新插件信息
exports.updatePlugin = (req, res) => {
  const { id } = req.params;
  const { name, description, version, browser_type, is_recommended } = req.body;

  const existing = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '插件不存在' });
  }

  db.prepare(`
    UPDATE plugins SET
      name = ?,
      description = ?,
      version = ?,
      browser_type = ?,
      is_recommended = ?
    WHERE id = ?
  `).run(
    name || existing.name,
    description ?? existing.description,
    version || existing.version,
    browser_type || existing.browser_type,
    is_recommended !== undefined ? (is_recommended ? 1 : 0) : existing.is_recommended,
    id
  );

  const plugin = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);

  res.json({ code: 200, message: '更新成功', data: plugin });
};

// 删除插件
exports.deletePlugin = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '插件不存在' });
  }

  // 删除文件
  if (fs.existsSync(existing.file_path)) {
    fs.unlinkSync(existing.file_path);
  }

  db.prepare('DELETE FROM plugins WHERE id = ?').run(id);

  res.json({ code: 200, message: '删除成功' });
};

// 设置推荐插件
exports.setRecommended = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '插件不存在' });
  }

  // 取消其他同类型插件的推荐状态
  db.prepare('UPDATE plugins SET is_recommended = 0 WHERE browser_type = ?').run(existing.browser_type);

  // 设置当前插件为推荐
  db.prepare('UPDATE plugins SET is_recommended = 1 WHERE id = ?').run(id);

  res.json({ code: 200, message: '设置成功' });
};

// 获取推荐插件（前台用）
exports.getRecommendedPlugins = (req, res) => {
  const plugins = db.prepare(`
    SELECT * FROM plugins WHERE is_recommended = 1
  `).all();

  res.json({ code: 200, data: plugins });
};
