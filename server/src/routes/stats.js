const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authMiddleware } = require('../middleware/auth');

// 所有统计接口都需要登录
router.get('/overview', authMiddleware, statsController.getOverview);
router.get('/trend', authMiddleware, statsController.getTrend);
router.get('/browser', authMiddleware, statsController.getBrowserStats);
router.get('/os', authMiddleware, statsController.getOsStats);
router.get('/region', authMiddleware, statsController.getRegionStats);
router.get('/hot-scripts', authMiddleware, statsController.getHotScripts);
router.get('/downloads', authMiddleware, statsController.getDownloadList);

module.exports = router;
