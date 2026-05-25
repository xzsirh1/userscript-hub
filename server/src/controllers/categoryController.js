const db = require('../models/database');

// 获取分类列表
exports.getCategories = (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(s.id) as script_count
    FROM categories c
    LEFT JOIN scripts s ON c.id = s.category_id
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.id ASC
  `).all();

  res.json({ code: 200, data: categories });
};

// 获取单个分类
exports.getCategory = (req, res) => {
  const { id } = req.params;
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

  if (!category) {
    return res.status(404).json({ code: 404, message: '分类不存在' });
  }

  res.json({ code: 200, data: category });
};

// 创建分类
exports.createCategory = (req, res) => {
  const { name, description, sort_order } = req.body;

  if (!name) {
    return res.status(400).json({ code: 400, message: '分类名称不能为空' });
  }

  const result = db.prepare(
    'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)'
  ).run(name, description || '', sort_order || 0);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '创建成功', data: category });
};

// 更新分类
exports.updateCategory = (req, res) => {
  const { id } = req.params;
  const { name, description, sort_order } = req.body;

  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '分类不存在' });
  }

  db.prepare(
    'UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?'
  ).run(name || existing.name, description ?? existing.description, sort_order ?? existing.sort_order, id);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

  res.json({ code: 200, message: '更新成功', data: category });
};

// 删除分类
exports.deleteCategory = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '分类不存在' });
  }

  // 将该分类下的脚本移到未分类
  db.prepare('UPDATE scripts SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);

  res.json({ code: 200, message: '删除成功' });
};
