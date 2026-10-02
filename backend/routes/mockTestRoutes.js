const express = require('express');
const {
  getMockTests,
  getMockTestById,
  startMockTestSession,
  saveAnswer,
  submitMockTestSession,
  getMockTestResult,
  heartbeat,
  reviewMockTestSession,
  getMockTestHistory,
  getMockTestStats,
} = require('../controllers/mockTestController');
const {
  startProctoring,
  recordProctoringEvent,
  proctoringHeartbeat,
  stopProctoring,
  getProctoringTimeline,
  getProctoringCorrelations,
  getProctoringReport,
  replayProctoringAdjudication,
  getProctoringDriftSummary,
} = require('../controllers/proctoringController');
const { protect, requireReviewerRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Candidate Mock Test History & Stats (Phase 4D) and Proctoring Drift Monitoring (Phase D)
// Placed before /:id so Express does not match 'history', 'stats', or 'proctoring' as an id
router.get('/history', protect, getMockTestHistory);
router.get('/stats', protect, getMockTestStats);
router.get('/proctoring/drift', protect, requireReviewerRole, getProctoringDriftSummary);

// Mock Test Catalog
router.get('/', protect, getMockTests);
router.get('/:id', protect, getMockTestById);

// Exam Session Lifecycle
router.post('/:id/start', protect, startMockTestSession);
router.post('/:sessionId/answer', protect, saveAnswer);
router.post('/:sessionId/submit', protect, submitMockTestSession);
router.get('/:sessionId/result', protect, getMockTestResult);
router.post('/:sessionId/review', protect, requireReviewerRole, reviewMockTestSession);
router.post('/:sessionId/heartbeat', protect, heartbeat);

// Proctoring Telemetry Lifecycle
router.post('/:sessionId/proctoring/start', protect, startProctoring);
router.post('/:sessionId/proctoring/event', protect, recordProctoringEvent);
router.post('/:sessionId/proctoring/heartbeat', protect, proctoringHeartbeat);
router.post('/:sessionId/proctoring/stop', protect, stopProctoring);
router.post('/:sessionId/proctoring/replay', protect, requireReviewerRole, replayProctoringAdjudication);
router.get('/:sessionId/proctoring', protect, getProctoringTimeline);
router.get('/:sessionId/proctoring/correlations', protect, getProctoringCorrelations);
router.get('/:sessionId/proctoring/report', protect, getProctoringReport);

module.exports = router;
