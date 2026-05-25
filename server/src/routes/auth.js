const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// 登录
router.get('/setup-status', authController.getSetupStatus);
router.post('/setup', authController.setup);
router.post('/login', authController.login);

// 需要登录的接口
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
