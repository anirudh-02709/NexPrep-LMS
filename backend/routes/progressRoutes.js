const express = require('express');
const { updateProgress, getContinueLearning } = require('../controllers/progressController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/update', protect, updateProgress);
router.get('/continue', protect, getContinueLearning);

module.exports = router;
