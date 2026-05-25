const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pluginController = require('../controllers/pluginController');
const { authMiddleware } = require('../middleware/auth');
const config = require('../config');

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(config.uploadPath, 'plugins'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSize },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.allowedPluginTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 公开接口
router.get('/', pluginController.getPlugins);
router.get('/recommended', pluginController.getRecommendedPlugins);
router.get('/:id', pluginController.getPlugin);

// 需要登录的接口
router.post('/', authMiddleware, upload.single('file'), pluginController.uploadPlugin);
router.put('/:id', authMiddleware, pluginController.updatePlugin);
router.delete('/:id', authMiddleware, pluginController.deletePlugin);
router.post('/:id/recommend', authMiddleware, pluginController.setRecommended);

module.exports = router;
