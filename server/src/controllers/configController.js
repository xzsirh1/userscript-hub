const db = require('../models/database');
const path = require('path');
const fs = require('fs');

// 更新 index.html 的标题（兼容宝塔和Docker两种部署环境）
const updateIndexHtml = (title) => {
  // 宝塔/PM2 环境: server/src/controllers/ → client/dist/index.html
  // Docker 环境:    /app/src/controllers/ → /app/public/index.html
  const candidates = [
    path.join(__dirname, '../../../client/dist/index.html'),  // 宝塔/PM2
    path.join(__dirname, '../../../public/index.html'),        // Docker
  ];

  for (const indexPath of candidates) {
    if (!fs.existsSync(indexPath)) continue;
    try {
      let html = fs.readFileSync(indexPath, 'utf-8');
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
      fs.writeFileSync(indexPath, html, 'utf-8');
      console.log('已更新 index.html 标题:', indexPath);
    } catch (e) {
      console.error('更新 index.html 失败:', indexPath, e.message);
    }
  }
};

// 获取所有配置
exports.getConfig = (req, res) => {
  const configs = db.prepare('SELECT * FROM site_config').all();
  const configObj = {};
  configs.forEach(c => {
    configObj[c.key] = c.value;
  });

  res.json({ code: 200, data: configObj });
};

// 更新配置
exports.updateConfig = (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ code: 400, message: '无效的配置数据' });
  }

  const updateStmt = db.prepare(`
    INSERT INTO site_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `);

  Object.keys(updates).forEach(key => {
    updateStmt.run(key, updates[key], updates[key]);
  });

  // 如果更新了标题，同步更新 index.html
  if (updates.title) {
    updateIndexHtml(updates.title);
  }

  res.json({ code: 200, message: '配置更新成功' });
};

// 获取单个配置
exports.getConfigByKey = (req, res) => {
  const { key } = req.params;
  const config = db.prepare('SELECT * FROM site_config WHERE key = ?').get(key);

  if (!config) {
    return res.status(404).json({ code: 404, message: '配置项不存在' });
  }

  res.json({ code: 200, data: config });
};

// 获取 favicon
exports.getFavicon = (req, res) => {
  const logosDir = path.join(__dirname, '../../uploads/logos');
  const extensions = ['.ico', '.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp'];

  // 查找自定义 favicon
  for (const ext of extensions) {
    const faviconPath = path.join(logosDir, 'favicon' + ext);
    if (fs.existsSync(faviconPath)) {
      const mimeTypes = {
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
      return res.sendFile(faviconPath);
    }
  }

  // 没有自定义 favicon，动态生成 SVG
  const shortNameConfig = db.prepare("SELECT value FROM site_config WHERE key = 'shortName'").get();
  const shortName = shortNameConfig?.value || 'XZ';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#409EFF;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#67C23A;stop-opacity:1"/>
    </linearGradient></defs>
    <rect x="10" y="10" width="80" height="80" rx="15" fill="url(#grad)"/>
    <text x="50" y="65" font-family="Arial,sans-serif" font-size="${shortName.length > 2 ? 28 : 40}" font-weight="bold" fill="white" text-anchor="middle">${shortName}</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=60'); // 动态生成的缓存短一点
  res.send(svg);
};

// 上传 favicon
exports.uploadFavicon = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请选择文件' });
  }

  // 删除其他格式的旧 favicon
  const logosDir = path.join(__dirname, '../../uploads/logos');
  const extensions = ['.ico', '.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp'];
  const uploadedExt = path.extname(req.file.filename).toLowerCase();

  extensions.forEach(ext => {
    if (ext !== uploadedExt) {
      const oldPath = path.join(logosDir, 'favicon' + ext);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
  });

  res.json({
    code: 200,
    message: '图标上传成功',
    data: {
      path: '/uploads/logos/' + req.file.filename,
      filename: req.file.filename
    }
  });
};

// 删除自定义 favicon（恢复默认）
exports.deleteFavicon = (req, res) => {
  const logosDir = path.join(__dirname, '../../uploads/logos');
  const extensions = ['.ico', '.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp'];
  let deleted = false;

  extensions.forEach(ext => {
    const faviconPath = path.join(logosDir, 'favicon' + ext);
    if (fs.existsSync(faviconPath)) {
      fs.unlinkSync(faviconPath);
      deleted = true;
    }
  });

  if (deleted) {
    res.json({ code: 200, message: '已恢复默认图标' });
  } else {
    res.json({ code: 200, message: '当前已是默认图标' });
  }
};
