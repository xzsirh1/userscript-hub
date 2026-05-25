const db = require('../models/database');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

// 记录下载统计
exports.recordDownload = (targetType, targetId, req) => {
  const parser = new UAParser(req.headers['user-agent']);
  const ua = parser.getResult();

  // 获取真实IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.ip;

  // 获取地理位置
  const geo = geoip.lookup(ip) || {};

  db.prepare(`
    INSERT INTO download_stats (target_type, target_id, ip_address, user_agent, browser, os, device, country, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    targetType,
    targetId,
    ip,
    req.headers['user-agent'],
    ua.browser.name || 'Unknown',
    ua.os.name || 'Unknown',
    ua.device.type || 'desktop',
    geo.country || 'Unknown',
    geo.city || 'Unknown'
  );

  // 更新下载计数
  if (targetType === 'script') {
    db.prepare('UPDATE scripts SET download_count = download_count + 1 WHERE id = ?').run(targetId);
  } else if (targetType === 'plugin') {
    db.prepare('UPDATE plugins SET download_count = download_count + 1 WHERE id = ?').run(targetId);
  } else if (targetType === 'program') {
    db.prepare('UPDATE programs SET download_count = download_count + 1 WHERE id = ?').run(targetId);
  }
};

// 获取统计概览
exports.getOverview = (req, res) => {
  const scriptCount = db.prepare('SELECT COUNT(*) as count FROM scripts').get().count;
  const pluginCount = db.prepare('SELECT COUNT(*) as count FROM plugins').get().count;
  const programCount = db.prepare('SELECT COUNT(*) as count FROM programs').get().count;
  const totalDownloads = db.prepare('SELECT COUNT(*) as count FROM download_stats').get().count;

  // 今日下载
  const todayDownloads = db.prepare(`
    SELECT COUNT(*) as count FROM download_stats
    WHERE date(created_at) = date('now')
  `).get().count;

  // 本周下载
  const weekDownloads = db.prepare(`
    SELECT COUNT(*) as count FROM download_stats
    WHERE created_at >= datetime('now', '-7 days')
  `).get().count;

  // 本月下载
  const monthDownloads = db.prepare(`
    SELECT COUNT(*) as count FROM download_stats
    WHERE created_at >= datetime('now', '-30 days')
  `).get().count;

  res.json({
    code: 200,
    data: {
      scriptCount,
      pluginCount,
      programCount,
      totalDownloads,
      todayDownloads,
      weekDownloads,
      monthDownloads
    }
  });
};

// 获取下载趋势（最近30天）
exports.getTrend = (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));

  const trend = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM download_stats
    WHERE created_at >= datetime('now', ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all('-' + days);

  res.json({ code: 200, data: trend });
};

// 获取浏览器分布
exports.getBrowserStats = (req, res) => {
  const stats = db.prepare(`
    SELECT browser, COUNT(*) as count
    FROM download_stats
    GROUP BY browser
    ORDER BY count DESC
    LIMIT 10
  `).all();

  res.json({ code: 200, data: stats });
};

// 获取操作系统分布
exports.getOsStats = (req, res) => {
  const stats = db.prepare(`
    SELECT os, COUNT(*) as count
    FROM download_stats
    GROUP BY os
    ORDER BY count DESC
    LIMIT 10
  `).all();

  res.json({ code: 200, data: stats });
};

// 获取地区分布
exports.getRegionStats = (req, res) => {
  const stats = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM download_stats
    GROUP BY country
    ORDER BY count DESC
    LIMIT 20
  `).all();

  res.json({ code: 200, data: stats });
};

// 获取热门脚本
exports.getHotScripts = (req, res) => {
  const { limit = 10 } = req.query;

  const scripts = db.prepare(`
    SELECT s.*, COUNT(d.id) as recent_downloads
    FROM scripts s
    LEFT JOIN download_stats d ON d.target_type = 'script' AND d.target_id = s.id
      AND d.created_at >= datetime('now', '-30 days')
    WHERE s.is_private = 0
    GROUP BY s.id
    ORDER BY recent_downloads DESC
    LIMIT ?
  `).all(parseInt(limit));

  res.json({ code: 200, data: scripts });
};

// 获取下载详情列表
exports.getDownloadList = (req, res) => {
  const { target_type, target_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let sql = 'SELECT * FROM download_stats WHERE 1=1';
  const params = [];

  if (target_type) {
    sql += ' AND target_type = ?';
    params.push(target_type);
  }

  if (target_id) {
    sql += ' AND target_id = ?';
    params.push(target_id);
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const list = db.prepare(sql).all(...params);

  res.json({
    code: 200,
    data: {
      list,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
};
