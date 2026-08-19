const express = require('express');
const {
  getTestQuestions,
  saveTestResult,
  getTestHistory,
  getDashboard,
} = require('../controllers/testController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/questions', protect, getTestQuestions);
router.post('/result', protect, saveTestResult);
router.get('/history', protect, getTestHistory);
router.get('/dashboard', protect, getDashboard);

module.exports = router;
