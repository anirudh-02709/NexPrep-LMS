const express = require('express');
const {
	updateProgress,
	markChapterCompleted,
	markChapterIncomplete,
	getChapterStatus,
	getSubjectProgressStats,
	getContinueLearning,
} = require('../controllers/progressController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/update', protect, updateProgress);
router.post('/complete', protect, markChapterCompleted);
router.post('/incomplete', protect, markChapterIncomplete);
router.get('/status', protect, getChapterStatus);
router.get('/stats', protect, getSubjectProgressStats);
router.get('/continue', protect, getContinueLearning);

module.exports = router;
