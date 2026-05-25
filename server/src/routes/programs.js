const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const programController = require('../controllers/programController');
const { authMiddleware } = require('../middleware/auth');
const config = require('../config');

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(config.uploadPath, 'programs'));
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
    if (config.allowedProgramTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 公开接口
router.get('/', programController.getPrograms);
router.get('/recommended', programController.getRecommendedPrograms);
router.get('/:id', programController.getProgram);

// 需要登录的接口
router.post('/', authMiddleware, upload.single('file'), programController.uploadProgram);
router.put('/:id', authMiddleware, programController.updateProgram);
router.delete('/:id', authMiddleware, programController.deleteProgram);
router.post('/:id/recommend', authMiddleware, programController.setRecommended);

module.exports = router;
