const express = require('express');
const {
  getMockTests,
  getMockTestById,
  startMockTestSession,
  saveAnswer,
  submitMockTestSession,
  getMockTestResult,
  heartbeat,
} = require('../controllers/mockTestController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Mock Test Catalog
router.get('/', protect, getMockTests);
router.get('/:id', protect, getMockTestById);

// Exam Session Lifecycle
router.post('/:id/start', protect, startMockTestSession);
router.post('/:sessionId/answer', protect, saveAnswer);
router.post('/:sessionId/submit', protect, submitMockTestSession);
router.get('/:sessionId/result', protect, getMockTestResult);
router.post('/:sessionId/heartbeat', protect, heartbeat);

module.exports = router;
