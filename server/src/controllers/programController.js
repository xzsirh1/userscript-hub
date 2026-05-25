const db = require('../models/database');
const path = require('path');
const fs = require('fs');

// 获取程序列表
exports.getPrograms = (req, res) => {
  const programs = db.prepare(`
    SELECT * FROM programs ORDER BY is_recommended DESC, created_at DESC
  `).all();

  res.json({ code: 200, data: programs });
};

// 获取单个程序
exports.getProgram = (req, res) => {
  const { id } = req.params;
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);

  if (!program) {
    return res.status(404).json({ code: 404, message: '程序不存在' });
  }

  res.json({ code: 200, data: program });
};

// 上传程序
exports.uploadProgram = (req, res) => {
  const { name, description, version, is_recommended } = req.body;

  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传程序文件' });
  }

  if (!name) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: '程序名称不能为空' });
  }

  const result = db.prepare(`
    INSERT INTO programs (name, description, version, file_path, file_size, is_recommended)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || '',
    version || '1.0.0',
    req.file.path,
    req.file.size,
    is_recommended ? 1 : 0
  );

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '上传成功', data: program });
};

// 更新程序信息
exports.updateProgram = (req, res) => {
  const { id } = req.params;
  const { name, description, version, is_recommended } = req.body;

  const existing = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '程序不存在' });
  }

  db.prepare(`
    UPDATE programs SET
      name = ?,
      description = ?,
      version = ?,
      is_recommended = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || existing.name,
    description ?? existing.description,
    version || existing.version,
    is_recommended !== undefined ? (is_recommended ? 1 : 0) : existing.is_recommended,
    id
  );

  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);

  res.json({ code: 200, message: '更新成功', data: program });
};

// 删除程序
exports.deleteProgram = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '程序不存在' });
  }

  // 删除文件
  if (fs.existsSync(existing.file_path)) {
    fs.unlinkSync(existing.file_path);
  }

  db.prepare('DELETE FROM programs WHERE id = ?').run(id);

  res.json({ code: 200, message: '删除成功' });
};

// 设置推荐程序
exports.setRecommended = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '程序不存在' });
  }

  // 取消其他程序的推荐状态
  db.prepare('UPDATE programs SET is_recommended = 0').run();

  // 设置当前程序为推荐
  db.prepare('UPDATE programs SET is_recommended = 1 WHERE id = ?').run(id);

  res.json({ code: 200, message: '设置成功' });
};

// 获取推荐程序（前台用）
exports.getRecommendedPrograms = (req, res) => {
  const programs = db.prepare(`
    SELECT * FROM programs WHERE is_recommended = 1
  `).all();

  res.json({ code: 200, data: programs });
};
