const express = require('express');
const { saveTestResult, getTestHistory, getDashboard } = require('../controllers/testController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/result', protect, saveTestResult);
router.get('/history', protect, getTestHistory);
router.get('/dashboard', protect, getDashboard);

module.exports = router;
