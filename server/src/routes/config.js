const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// favicon 上传配置
const faviconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // 固定文件名，覆盖旧的
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'favicon' + ext);
  }
});

const faviconUpload = multer({
  storage: faviconStorage,
  limits: { fileSize: 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.ico', '.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 ico/png/svg/jpg/gif/webp 格式'));
    }
  }
});

// 公开接口（前台获取配置）
router.get('/', configController.getConfig);

// 获取 favicon（动态返回）- 必须在 /:key 之前
router.get('/favicon', configController.getFavicon);

router.get('/:key', configController.getConfigByKey);

// 需要登录的接口
router.put('/', authMiddleware, configController.updateConfig);

// 上传 favicon
router.post('/favicon', authMiddleware, faviconUpload.single('file'), configController.uploadFavicon);

// 删除自定义 favicon（恢复默认）
router.delete('/favicon', authMiddleware, configController.deleteFavicon);

module.exports = router;
