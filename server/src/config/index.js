const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

function resolveServerPath(targetPath) {
  if (!targetPath) return targetPath;
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(SERVER_ROOT, targetPath);
}

module.exports = {
  // 服务器配置
  port: process.env.PORT || 3000,

  // JWT配置
  jwtSecret: process.env.JWT_SECRET || 'userscript-hub-secret-key-change-me',
  jwtExpiresIn: '7d',

  // 数据库路径
  dbPath: resolveServerPath(process.env.DB_PATH || './data/database.db'),

  // 默认管理员账号仅用于兼容旧环境；新部署应通过 /setup 初始化
  defaultAdmin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin'
  },

  // 上传配置
  uploadPath: resolveServerPath(process.env.UPLOAD_PATH || './uploads'),
  maxFileSize: 50 * 1024 * 1024, // 50MB

  // 允许的文件类型
  allowedScriptTypes: ['.user.js', '.js'],
  allowedPluginTypes: ['.crx', '.xpi', '.zip'],
  allowedImageTypes: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'],
  allowedProgramTypes: ['.exe'],

  // 网站默认配置
  defaultSiteConfig: {
    title: '脚本分发平台',
    shortName: 'JS',
    description: '通用脚本、浏览器插件和程序分发平台',
    footer: '脚本分发平台 - 让安装和分发更简单',
    primaryColor: '#409EFF',
    announcement: '欢迎使用脚本分发平台，请先完成部署初始化'
  }
};
