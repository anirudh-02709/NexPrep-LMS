const mongoose = require('mongoose');
const MockTest = require('../models/MockTest');
const MockTestSession = require('../models/MockTestSession');
const {
  sanitizeQuestions,
  validateAndScoreMockTest,
  buildQuestionReview,
} = require('../services/mockTestScoring');
const { ensureSeedMockTests } = require('../data/mockTestData');

/**
 * Helper to resolve mock test by ID or slug.
 */
async function findMockTestByIdOrSlug(idOrSlug) {
  if (!idOrSlug) return null;

  if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
    const testById = await MockTest.findById(idOrSlug);
    if (testById) return testById;
  }

  return MockTest.findOne({ slug: String(idOrSlug).toLowerCase().trim() });
}

/**
 * GET /api/mock-tests
 * Lists all active mock tests.
 */
const getMockTests = async (req, res, next) => {
  try {
    await ensureSeedMockTests(MockTest);

    const mockTests = await MockTest.find({ active: true })
      .select('title slug type description duration totalQuestions totalMarks sections active createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Check if user has an active in_progress session
    const activeSession = await MockTestSession.findOne({
      user: req.user.id,
      status: 'in_progress',
    })
      .select('_id mockTest expiresAt startedAt')
      .lean();

    return res.status(200).json({
      success: true,
      mockTests,
      activeSession: activeSession
        ? {
            sessionId: activeSession._id,
            mockTestId: activeSession.mockTest,
            expiresAt: activeSession.expiresAt,
            startedAt: activeSession.startedAt,
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/mock-tests/:id
 * Retrieves metadata for a specific mock test.
 */
const getMockTestById = async (req, res, next) => {
  try {
    await ensureSeedMockTests(MockTest);

    const mockTest = await findMockTestByIdOrSlug(req.params.id);
    if (!mockTest || !mockTest.active) {
      res.status(404);
      throw new Error('Mock test not found.');
    }

    const activeSession = await MockTestSession.findOne({
      user: req.user.id,
      mockTest: mockTest._id,
      status: 'in_progress',
    })
      .select('_id status startedAt expiresAt')
      .lean();

    return res.status(200).json({
      success: true,
      mockTest: {
        id: mockTest._id,
        title: mockTest.title,
        slug: mockTest.slug,
        type: mockTest.type,
        description: mockTest.description,
        duration: mockTest.duration,
        totalQuestions: mockTest.totalQuestions,
        totalMarks: mockTest.totalMarks,
        markingScheme: mockTest.markingScheme,
        sections: mockTest.sections,
      },
      activeSession: activeSession
        ? {
            sessionId: activeSession._id,
            status: activeSession.status,
            startedAt: activeSession.startedAt,
            expiresAt: activeSession.expiresAt,
          }
        : null,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:id/start
 * Starts a new mock test session or resumes an existing active session.
 */
const startMockTestSession = async (req, res, next) => {
  try {
    await ensureSeedMockTests(MockTest);

    const mockTest = await findMockTestByIdOrSlug(req.params.id);
    if (!mockTest || !mockTest.active) {
      res.status(404);
      throw new Error('Mock test not found.');
    }

    // Check if user has an existing in_progress session for this mock test
    const existingSession = await MockTestSession.findOne({
      user: req.user.id,
      mockTest: mockTest._id,
      status: 'in_progress',
    });

    const now = Date.now();

    if (existingSession) {
      const expiresAtMs = new Date(existingSession.expiresAt).getTime();

      if (now > expiresAtMs) {
        // Session has expired
        existingSession.status = 'expired';
        await existingSession.save();
      } else {
        // Session is still active - RESUME IT seamlessly without duplicate attempt
        const sanitizedQuestions = sanitizeQuestions(mockTest.questions);

        return res.status(200).json({
          success: true,
          message: 'Resumed existing mock test session.',
          sessionId: existingSession._id,
          status: existingSession.status,
          startedAt: existingSession.startedAt,
          expiresAt: existingSession.expiresAt,
          answers: existingSession.answers,
          questions: sanitizedQuestions,
          mockTest: {
            id: mockTest._id,
            title: mockTest.title,
            slug: mockTest.slug,
            duration: mockTest.duration,
            totalQuestions: mockTest.totalQuestions,
            totalMarks: mockTest.totalMarks,
            sections: mockTest.sections,
            markingScheme: mockTest.markingScheme,
          },
        });
      }
    }

    // Server-authoritative start and expiration times
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + mockTest.duration * 60 * 1000);

    // Pre-initialize answer objects for all questions in the test
    const initialAnswers = mockTest.questions.map((q) => ({
      questionId: q.id,
      section: q.section,
      selectedOption: -1,
      isMarkedForReview: false,
      answeredAt: null,
    }));

    const session = await MockTestSession.create({
      user: req.user.id,
      mockTest: mockTest._id,
      status: 'in_progress',
      startedAt,
      expiresAt,
      answers: initialAnswers,
    });

    const sanitizedQuestions = sanitizeQuestions(mockTest.questions);

    return res.status(201).json({
      success: true,
      message: 'Mock test session started successfully.',
      sessionId: session._id,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      answers: session.answers,
      questions: sanitizedQuestions,
      mockTest: {
        id: mockTest._id,
        title: mockTest.title,
        slug: mockTest.slug,
        duration: mockTest.duration,
        totalQuestions: mockTest.totalQuestions,
        totalMarks: mockTest.totalMarks,
        sections: mockTest.sections,
        markingScheme: mockTest.markingScheme,
      },
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/answer
 * Records or updates an answer for a specific question in an active session.
 */
const saveAnswer = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { questionId, selectedOption, isMarkedForReview } = req.body;

    if (!questionId || typeof questionId !== 'string') {
      res.status(400);
      throw new Error('Valid questionId is required.');
    }

    const session = await MockTestSession.findById(sessionId);
    if (!session) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (session.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    if (session.status !== 'in_progress') {
      res.status(400);
      throw new Error(`Cannot submit answers to an exam session with status '${session.status}'.`);
    }

    // Server-authoritative expiration check
    const now = Date.now();
    if (now > new Date(session.expiresAt).getTime()) {
      session.status = 'expired';
      await session.save();
      res.status(400);
      throw new Error('Exam session has expired.');
    }

    // Verify question belongs to mock test
    const mockTest = await MockTest.findById(session.mockTest);
    if (!mockTest) {
      res.status(404);
      throw new Error('Associated mock test not found.');
    }

    const authQuestion = mockTest.questions.find((q) => q.id === questionId);
    if (!authQuestion) {
      res.status(400);
      throw new Error(`Question ID '${questionId}' does not belong to this mock test.`);
    }

    // Validate selectedOption
    if (selectedOption !== null && selectedOption !== undefined && selectedOption !== -1) {
      if (!Number.isInteger(selectedOption)) {
        res.status(400);
        throw new Error('selectedOption must be an integer.');
      }
      if (selectedOption < 0 || selectedOption >= authQuestion.options.length) {
        res.status(400);
        throw new Error(
          `selectedOption ${selectedOption} is out of range [0, ${authQuestion.options.length - 1}].`
        );
      }
    }

    const normalizedOption =
      selectedOption === null || selectedOption === undefined ? -1 : selectedOption;

    // Update answer in session
    let answerEntry = session.answers.find((a) => a.questionId === questionId);
    if (answerEntry) {
      answerEntry.selectedOption = normalizedOption;
      if (typeof isMarkedForReview === 'boolean') {
        answerEntry.isMarkedForReview = isMarkedForReview;
      }
      answerEntry.answeredAt = new Date();
    } else {
      session.answers.push({
        questionId,
        section: authQuestion.section,
        selectedOption: normalizedOption,
        isMarkedForReview: !!isMarkedForReview,
        answeredAt: new Date(),
      });
    }

    session.lastHeartbeatAt = new Date();
    await session.save();

    return res.status(200).json({
      success: true,
      message: 'Answer saved successfully.',
      savedAnswer: {
        questionId,
        selectedOption: normalizedOption,
        isMarkedForReview: !!isMarkedForReview,
      },
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/submit
 * Submits the session and performs authoritative server-side scoring.
 */
const submitMockTestSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { answers } = req.body;

    const session = await MockTestSession.findById(sessionId);
    if (!session) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (session.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    // Prevent duplicate submission
    if (session.status === 'completed') {
      res.status(400);
      throw new Error('Exam session has already been submitted.');
    }

    const mockTest = await MockTest.findById(session.mockTest);
    if (!mockTest) {
      res.status(404);
      throw new Error('Associated mock test not found.');
    }

    // Strict expiration check with small grace buffer (60s) for network transit
    const now = Date.now();
    const graceBufferMs = 60 * 1000;
    if (now > new Date(session.expiresAt).getTime() + graceBufferMs) {
      session.status = 'expired';
      await session.save();
      res.status(400);
      throw new Error('Submission rejected: exam session has expired.');
    }

    // If client supplied final batch of answers, merge them into session.answers
    if (Array.isArray(answers)) {
      const authIds = new Set(mockTest.questions.map((q) => q.id));

      answers.forEach((submitted) => {
        if (submitted && submitted.questionId && authIds.has(submitted.questionId)) {
          let existing = session.answers.find((a) => a.questionId === submitted.questionId);
          if (existing) {
            existing.selectedOption =
              submitted.selectedOption !== undefined && submitted.selectedOption !== null
                ? submitted.selectedOption
                : existing.selectedOption;
            if (typeof submitted.isMarkedForReview === 'boolean') {
              existing.isMarkedForReview = submitted.isMarkedForReview;
            }
          }
        }
      });
    }

    // Authoritative Server-Side Scoring
    const result = validateAndScoreMockTest(mockTest, session.answers);

    session.status = 'completed';
    session.submittedAt = new Date();
    session.result = result;

    await session.save();

    return res.status(200).json({
      success: true,
      message: 'Exam submitted and evaluated successfully.',
      sessionId: session._id,
      status: session.status,
      submittedAt: session.submittedAt,
      result,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * GET /api/mock-tests/:sessionId/result
 * Retrieves the result of a completed exam session.
 */
const getMockTestResult = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await MockTestSession.findById(sessionId);
    if (!session) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (session.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    if (session.status === 'in_progress') {
      res.status(400);
      throw new Error('Exam session is still in progress. Please submit the test first.');
    }

    const mockTest = await MockTest.findById(session.mockTest);
    if (!mockTest) {
      res.status(404);
      throw new Error('Associated mock test not found.');
    }

    const review = buildQuestionReview(mockTest, session.answers);

    return res.status(200).json({
      success: true,
      sessionId: session._id,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      mockTest: {
        id: mockTest._id,
        title: mockTest.title,
        slug: mockTest.slug,
        type: mockTest.type,
        duration: mockTest.duration,
        totalQuestions: mockTest.totalQuestions,
        totalMarks: mockTest.totalMarks,
        sections: mockTest.sections,
        markingScheme: mockTest.markingScheme,
      },
      result: session.result,
      review,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/heartbeat
 * Heartbeat endpoint for active session telemetry and expiration checks.
 */
const heartbeat = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await MockTestSession.findById(sessionId);
    if (!session) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (session.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    const now = Date.now();
    const expiresAtMs = new Date(session.expiresAt).getTime();

    if (session.status === 'in_progress' && now > expiresAtMs) {
      session.status = 'expired';
    }

    session.lastHeartbeatAt = new Date();
    await session.save();

    const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

    return res.status(200).json({
      success: true,
      status: session.status,
      remainingSeconds,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

module.exports = {
  getMockTests,
  getMockTestById,
  startMockTestSession,
  saveAnswer,
  submitMockTestSession,
  getMockTestResult,
  heartbeat,
};
