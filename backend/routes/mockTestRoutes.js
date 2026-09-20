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
const {
  startProctoring,
  recordProctoringEvent,
  proctoringHeartbeat,
  stopProctoring,
  getProctoringTimeline,
  getProctoringCorrelations,
  getProctoringReport,
} = require('../controllers/proctoringController');
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

// Proctoring Telemetry Lifecycle
router.post('/:sessionId/proctoring/start', protect, startProctoring);
router.post('/:sessionId/proctoring/event', protect, recordProctoringEvent);
router.post('/:sessionId/proctoring/heartbeat', protect, proctoringHeartbeat);
router.post('/:sessionId/proctoring/stop', protect, stopProctoring);
router.get('/:sessionId/proctoring', protect, getProctoringTimeline);
router.get('/:sessionId/proctoring/correlations', protect, getProctoringCorrelations);
router.get('/:sessionId/proctoring/report', protect, getProctoringReport);

module.exports = router;
