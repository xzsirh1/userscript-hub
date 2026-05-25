const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const scriptController = require('../controllers/scriptController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const config = require('../config');

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(config.uploadPath, 'scripts'));
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
    if (config.allowedScriptTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 公开接口
router.get('/', optionalAuth, scriptController.getScripts);
router.get('/:id', optionalAuth, scriptController.getScript);
router.get('/:id/versions', scriptController.getVersions);
router.post('/:id/verify-password', scriptController.verifyPassword);

// 需要登录的接口
router.post('/', authMiddleware, scriptController.createScript);
router.put('/:id', authMiddleware, scriptController.updateScript);
router.delete('/:id', authMiddleware, scriptController.deleteScript);
router.post('/:id/versions', authMiddleware, upload.single('file'), scriptController.uploadVersion);
router.delete('/:id/versions/:versionId', authMiddleware, scriptController.deleteVersion);

module.exports = router;
