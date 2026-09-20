const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent, ALLOWED_EVENT_TYPES, EVENT_SOURCES } = require('../models/ProctoringEvent');

/**
 * Validates environmental state string against allowed enum values.
 */
function sanitizeState(value, allowedValues, fallback = 'inactive') {
  if (typeof value === 'string' && allowedValues.includes(value.toLowerCase().trim())) {
    return value.toLowerCase().trim();
  }
  return fallback;
}

/**
 * Validates metadata object, rejecting payloads exceeding 4 KB, non-objects,
 * raw image/binary data URLs, forbidden media payload keys, or malformed values.
 */
function validateMetadata(metadata, res) {
  if (metadata === undefined || metadata === null) {
    return {};
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    res.status(400);
    throw new Error('Event metadata must be an object.');
  }

  // Strictly forbid raw media keys
  const forbiddenKeys = ['screenshot', 'image', 'frame', 'video', 'blob', 'rawframe', 'dataurl'];
  for (const key of Object.keys(metadata)) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      res.status(400);
      throw new Error('Image and binary payloads are not permitted in event metadata.');
    }
  }

  let metadataStr;
  try {
    metadataStr = JSON.stringify(metadata);
  } catch (err) {
    res.status(400);
    throw new Error('Malformed metadata payload.');
  }
  if (Buffer.byteLength(metadataStr, 'utf8') > 4096) {
    res.status(400);
    throw new Error('Metadata payload exceeds maximum allowed size of 4KB.');
  }
  if (/data:image\//i.test(metadataStr) || /;base64,/i.test(metadataStr)) {
    res.status(400);
    throw new Error('Image and binary payloads are not permitted in event metadata.');
  }

  // Validate known screen metadata fields if present
  if (metadata.displaySurface !== undefined) {
    const allowedSurfaces = ['browser', 'window', 'monitor', 'unknown'];
    if (typeof metadata.displaySurface !== 'string' || !allowedSurfaces.includes(metadata.displaySurface.toLowerCase())) {
      res.status(400);
      throw new Error(`Invalid displaySurface: '${metadata.displaySurface}'. Allowed values: ${allowedSurfaces.join(', ')}.`);
    }
  }

  if (metadata.width !== undefined) {
    if (typeof metadata.width !== 'number' || !Number.isFinite(metadata.width) || metadata.width < 0) {
      res.status(400);
      throw new Error('Metadata property "width" must be a non-negative number.');
    }
  }

  if (metadata.height !== undefined) {
    if (typeof metadata.height !== 'number' || !Number.isFinite(metadata.height) || metadata.height < 0) {
      res.status(400);
      throw new Error('Metadata property "height" must be a non-negative number.');
    }
  }

  if (metadata.frameRate !== undefined) {
    if (typeof metadata.frameRate !== 'number' || !Number.isFinite(metadata.frameRate) || metadata.frameRate < 0) {
      res.status(400);
      throw new Error('Metadata property "frameRate" must be a non-negative number.');
    }
  }

  if (metadata.similarity !== undefined) {
    if (typeof metadata.similarity !== 'number' || !Number.isFinite(metadata.similarity) || metadata.similarity < 0 || metadata.similarity > 1) {
      res.status(400);
      throw new Error('Metadata property "similarity" must be a number between 0 and 1.');
    }
  }

  if (metadata.classification !== undefined) {
    if (typeof metadata.classification !== 'string' || metadata.classification.trim().length === 0) {
      res.status(400);
      throw new Error('Metadata property "classification" must be a non-empty string.');
    }
  }

  if (metadata.analysisVersion !== undefined) {
    if (typeof metadata.analysisVersion !== 'string' || metadata.analysisVersion.trim().length === 0) {
      res.status(400);
      throw new Error('Metadata property "analysisVersion" must be a non-empty string.');
    }
  }

  return metadata;
}

/**
 * POST /api/mock-tests/:sessionId/proctoring/start
 * Starts or resumes a proctoring session associated with an active mock test session.
 */
const startProctoring = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const mockSession = await MockTestSession.findById(sessionId);
    if (!mockSession) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (mockSession.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    // Verify mock session is in_progress
    if (mockSession.status !== 'in_progress') {
      res.status(400);
      throw new Error(`Cannot start proctoring for an exam session with status '${mockSession.status}'.`);
    }

    // Expiration check
    const now = Date.now();
    if (now > new Date(mockSession.expiresAt).getTime()) {
      mockSession.status = 'expired';
      await mockSession.save();
      res.status(400);
      throw new Error('Exam session has expired.');
    }

    // Check if ProctoringSession already exists (ensures 1-to-1 semantics and prevents duplicates)
    let procSession = await ProctoringSession.findOne({ mockTestSession: mockSession._id });

    if (procSession) {
      if (procSession.status === 'active') {
        // Return existing active session without duplicate creation (resilient to refresh)
        return res.status(200).json({
          success: true,
          message: 'Resumed existing proctoring session.',
          proctoringSession: procSession,
        });
      }
      // If previous was abandoned, reactivate it
      procSession.status = 'active';
      procSession.lastHeartbeatAt = new Date();
    } else {
      // Create new ProctoringSession with initial states
      const cameraState = sanitizeState(req.body.cameraState, ['active', 'inactive', 'denied', 'unsupported']);
      const microphoneState = sanitizeState(req.body.microphoneState, ['active', 'inactive', 'denied', 'unsupported']);
      const screenShareState = sanitizeState(req.body.screenShareState, ['active', 'inactive', 'denied', 'unsupported']);
      const fullscreenState = sanitizeState(req.body.fullscreenState, ['active', 'inactive', 'unsupported']);
      const visibilityState = sanitizeState(req.body.visibilityState, ['visible', 'hidden'], 'visible');

      const validatedMetadata = validateMetadata(req.body.metadata, res);

      procSession = await ProctoringSession.create({
        mockTestSession: mockSession._id,
        user: req.user.id,
        status: 'active',
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
        cameraState,
        microphoneState,
        screenShareState,
        fullscreenState,
        visibilityState,
        metadata: validatedMetadata,
      });
    }

    // Link back on MockTestSession
    mockSession.proctoringSession = procSession._id;
    await mockSession.save();

    // Record immutable PROCTORING_STARTED event
    await ProctoringEvent.create({
      proctoringSession: procSession._id,
      mockTestSession: mockSession._id,
      user: req.user.id,
      type: 'PROCTORING_STARTED',
      source: 'session',
      timestamp: new Date(),
      metadata: {
        cameraState: procSession.cameraState,
        microphoneState: procSession.microphoneState,
        screenShareState: procSession.screenShareState,
        fullscreenState: procSession.fullscreenState,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Proctoring session started successfully.',
      proctoringSession: procSession,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/proctoring/event
 * Records an immutable telemetry observation event.
 */
const recordProctoringEvent = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { type, source, duration, metadata } = req.body;

    if (!type || typeof type !== 'string') {
      res.status(400);
      throw new Error('Event type is required.');
    }

    // Validate type against controlled Phase 2 & 3 enums
    if (!ALLOWED_EVENT_TYPES.includes(type)) {
      res.status(400);
      throw new Error(`Invalid proctoring event type: '${type}'.`);
    }

    const validatedMetadata = validateMetadata(metadata, res);
    const validatedSource = EVENT_SOURCES.includes(source) ? source : 'browser';

    const mockSession = await MockTestSession.findById(sessionId);
    if (!mockSession) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    // Verify session ownership
    if (mockSession.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to record events on this exam session.');
    }

    // Verify mock session is not expired or completed
    if (mockSession.status !== 'in_progress') {
      res.status(400);
      throw new Error(`Cannot record events on an exam session with status '${mockSession.status}'.`);
    }

    const now = Date.now();
    if (now > new Date(mockSession.expiresAt).getTime()) {
      mockSession.status = 'expired';
      await mockSession.save();
      res.status(400);
      throw new Error('Exam session has expired.');
    }

    const procSession = await ProctoringSession.findOne({ mockTestSession: mockSession._id });
    if (!procSession || procSession.status !== 'active') {
      res.status(400);
      throw new Error('No active proctoring session found for this mock test.');
    }

    // Update environmental states on ProctoringSession based on event
    if (type === 'CAMERA_STARTED') procSession.cameraState = 'active';
    else if (type === 'CAMERA_STOPPED') procSession.cameraState = 'inactive';
    else if (type === 'MICROPHONE_STARTED') procSession.microphoneState = 'active';
    else if (type === 'MICROPHONE_STOPPED') procSession.microphoneState = 'inactive';
    else if (type === 'SCREEN_SHARE_STARTED') procSession.screenShareState = 'active';
    else if (type === 'SCREEN_SHARE_STOPPED') procSession.screenShareState = 'inactive';
    else if (type === 'FULLSCREEN_ENTERED') procSession.fullscreenState = 'active';
    else if (type === 'FULLSCREEN_EXITED') procSession.fullscreenState = 'inactive';
    else if (type === 'PAGE_HIDDEN') procSession.visibilityState = 'hidden';
    else if (type === 'PAGE_VISIBLE') procSession.visibilityState = 'visible';

    procSession.lastHeartbeatAt = new Date();
    await procSession.save();

    // Server-assigned authoritative timestamp and identity
    const event = await ProctoringEvent.create({
      proctoringSession: procSession._id,
      mockTestSession: mockSession._id,
      user: req.user.id, // Strictly derived from req.user (client input ignored)
      type,
      source: validatedSource,
      timestamp: new Date(), // Authoritative server timestamp
      duration: Math.max(0, Number(duration) || 0),
      metadata: validatedMetadata,
    });

    return res.status(201).json({
      success: true,
      event: {
        id: event._id,
        type: event.type,
        source: event.source,
        timestamp: event.timestamp,
        duration: event.duration,
        metadata: event.metadata,
      },
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/proctoring/heartbeat
 * Heartbeat telemetry endpoint updating liveness on both ProctoringSession and MockTestSession.
 * Does NOT generate redundant ProctoringEvent database records.
 */
const proctoringHeartbeat = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const mockSession = await MockTestSession.findById(sessionId);
    if (!mockSession) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    if (mockSession.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    const procSession = await ProctoringSession.findOne({ mockTestSession: mockSession._id });
    if (!procSession) {
      res.status(404);
      throw new Error('Associated proctoring session not found.');
    }

    const now = Date.now();
    const expiresAtMs = new Date(mockSession.expiresAt).getTime();

    if (mockSession.status === 'in_progress' && now > expiresAtMs) {
      mockSession.status = 'expired';
      procSession.status = 'expired';
    }

    // Update environmental states if provided
    if (req.body.cameraState) {
      procSession.cameraState = sanitizeState(req.body.cameraState, ['active', 'inactive', 'denied', 'unsupported'], procSession.cameraState);
    }
    if (req.body.microphoneState) {
      procSession.microphoneState = sanitizeState(req.body.microphoneState, ['active', 'inactive', 'denied', 'unsupported'], procSession.microphoneState);
    }
    if (req.body.screenShareState) {
      procSession.screenShareState = sanitizeState(req.body.screenShareState, ['active', 'inactive', 'denied', 'unsupported'], procSession.screenShareState);
    }
    if (req.body.fullscreenState) {
      procSession.fullscreenState = sanitizeState(req.body.fullscreenState, ['active', 'inactive', 'unsupported'], procSession.fullscreenState);
    }
    if (req.body.visibilityState) {
      procSession.visibilityState = sanitizeState(req.body.visibilityState, ['visible', 'hidden'], procSession.visibilityState);
    }

    const heartbeatDate = new Date();
    procSession.lastHeartbeatAt = heartbeatDate;
    mockSession.lastHeartbeatAt = heartbeatDate;

    await Promise.all([procSession.save(), mockSession.save()]);

    const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));

    return res.status(200).json({
      success: true,
      status: procSession.status,
      mockTestStatus: mockSession.status,
      remainingSeconds,
      proctoringState: {
        cameraState: procSession.cameraState,
        microphoneState: procSession.microphoneState,
        screenShareState: procSession.screenShareState,
        fullscreenState: procSession.fullscreenState,
        visibilityState: procSession.visibilityState,
      },
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * POST /api/mock-tests/:sessionId/proctoring/stop
 * Concludes the proctoring session and logs PROCTORING_STOPPED.
 */
const stopProctoring = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const mockSession = await MockTestSession.findById(sessionId);
    if (!mockSession) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    if (mockSession.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    const procSession = await ProctoringSession.findOne({ mockTestSession: mockSession._id });
    if (!procSession) {
      res.status(404);
      throw new Error('Associated proctoring session not found.');
    }

    if (procSession.status !== 'completed') {
      procSession.status = 'completed';
      procSession.endedAt = new Date();
      procSession.cameraState = 'inactive';
      procSession.microphoneState = 'inactive';
      procSession.screenShareState = 'inactive';
      await procSession.save();

      await ProctoringEvent.create({
        proctoringSession: procSession._id,
        mockTestSession: mockSession._id,
        user: req.user.id,
        type: 'PROCTORING_STOPPED',
        source: 'session',
        timestamp: new Date(),
        metadata: { reason: req.body.reason || 'exam_submitted' },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Proctoring session stopped successfully.',
      proctoringSession: procSession,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

/**
 * GET /api/mock-tests/:sessionId/proctoring
 * Retrieves the proctoring timeline and environmental summary for session owner.
 */
const getProctoringTimeline = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const mockSession = await MockTestSession.findById(sessionId);
    if (!mockSession) {
      res.status(404);
      throw new Error('Mock test session not found.');
    }

    if (mockSession.user.toString() !== req.user.id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this exam session.');
    }

    const procSession = await ProctoringSession.findOne({ mockTestSession: mockSession._id });
    if (!procSession) {
      res.status(404);
      throw new Error('Associated proctoring session not found.');
    }

    const events = await ProctoringEvent.find({ proctoringSession: procSession._id })
      .select('type source timestamp duration metadata')
      .sort({ timestamp: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      proctoringSession: {
        id: procSession._id,
        status: procSession.status,
        startedAt: procSession.startedAt,
        endedAt: procSession.endedAt,
        lastHeartbeatAt: procSession.lastHeartbeatAt,
        cameraState: procSession.cameraState,
        microphoneState: procSession.microphoneState,
        screenShareState: procSession.screenShareState,
        fullscreenState: procSession.fullscreenState,
        visibilityState: procSession.visibilityState,
      },
      events,
      totalEvents: events.length,
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    return next(error);
  }
};

module.exports = {
  startProctoring,
  recordProctoringEvent,
  proctoringHeartbeat,
  stopProctoring,
  getProctoringTimeline,
};
