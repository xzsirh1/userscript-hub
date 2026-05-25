const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// 确保上传目录存在
const uploadDirs = ['scripts', 'plugins', 'logos', 'programs', 'runtime-manifests', 'runtime-modules'];
uploadDirs.forEach(dir => {
  const dirPath = path.join(config.uploadPath, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// 初始化数据库
require('./models/database');

const app = express();
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '25mb';

// 中间件
app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// 全局时区转换：将 SQLite CURRENT_TIMESTAMP (UTC) 转为本地时间
// SQLite 的 CURRENT_TIMESTAMP 永远存 UTC，格式为 "2026-02-16 09:00:00"（无时区标记）
// 需要把它当作 UTC 解析，然后转成本地时间显示
const TIME_FIELDS = [
  'created_at',
  'updated_at',
  'last_sync_at',
  'buildTime',
  'reviewed_at',
  'starts_at',
  'expires_at',
  'last_activated_at',
  'last_active_at',
  'published_at',
  'started_at',
  'last_heartbeat_at',
  'ended_at'
];
const SQLITE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function formatLocalTime(date) {
  return date.getFullYear() + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

function convertTimeFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertTimeFields);
  const result = { ...obj };
  for (const key of TIME_FIELDS) {
    if (result[key] && typeof result[key] === 'string' && SQLITE_TIME_REGEX.test(result[key])) {
      // SQLite 存的是 UTC，加 Z 后缀让 JS 当 UTC 解析，然后自动转本地时间
      const utcDate = new Date(result[key].replace(' ', 'T') + 'Z');
      if (!isNaN(utcDate.getTime())) {
        result[key] = formatLocalTime(utcDate);
      }
    }
  }
  for (const key of Object.keys(result)) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map(convertTimeFields);
    } else if (result[key] && typeof result[key] === 'object' && !Buffer.isBuffer(result[key])) {
      result[key] = convertTimeFields(result[key]);
    }
  }
  return result;
}

// 拦截 res.json，自动转换时间字段
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    return originalJson(convertTimeFields(data));
  };
  next();
});

// 静态文件服务 - 上传目录
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 静态文件服务 - 前端构建产物（Docker 部署时使用）
const publicPath = path.join(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/scripts', require('./routes/scripts'));
app.use('/api/plugins', require('./routes/plugins'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/config', require('./routes/config'));
app.use('/api/download', require('./routes/download'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/update', require('./routes/update'));
app.use('/api/runtime', require('./routes/runtime'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 200, message: 'OK', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      code: 413,
      message: `请求内容过大，当前限制 ${REQUEST_BODY_LIMIT}。请减少脚本体积或提高 REQUEST_BODY_LIMIT 后重试`
    });
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: 400, message: '文件大小超过限制' });
    }
    return res.status(400).json({ code: 400, message: err.message });
  }

  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
});

// 404处理 - API 路由返回 JSON
app.use('/api', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 前端路由 - SPA 支持（非 API 请求返回 index.html）
app.use((req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ code: 404, message: '页面不存在' });
  }
});

// 启动服务器
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api/health`);
});

module.exports = app;
