const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringEpisode = require('../models/ProctoringEpisode');
const MockTest = require('../models/MockTest');

const CORRELATION_WINDOW_MS = 3000;
const MAX_CLUSTER_DURATION_MS = 30000;

const EVENT_CATEGORIES = Object.freeze({
  // Attention / Browser telemetry
  FOCUS_LOST: 'ATTENTION',
  FOCUS_REGAINED: 'ATTENTION',
  PAGE_HIDDEN: 'ATTENTION',
  PAGE_VISIBLE: 'ATTENTION',
  FULLSCREEN_ENTERED: 'ATTENTION',
  FULLSCREEN_EXITED: 'ATTENTION',
  BEFORE_UNLOAD: 'ATTENTION',

  // Camera Computer Vision
  FACE_PRESENT: 'CAMERA',
  FACE_ABSENT: 'CAMERA',
  MULTIPLE_FACES: 'CAMERA',
  HEAD_POSE_DEVIATION: 'CAMERA',

  // Screen Monitoring
  SCREEN_SURFACE_IDENTIFIED: 'SCREEN',
  SCREEN_VIEW_STABLE: 'SCREEN',
  SCREEN_VIEW_CHANGED: 'SCREEN',
  SCREEN_VIEW_UNAVAILABLE: 'SCREEN',

  // Session / Media Lifecycle
  CAMERA_STARTED: 'SESSION_MEDIA',
  CAMERA_STOPPED: 'SESSION_MEDIA',
  MICROPHONE_STARTED: 'SESSION_MEDIA',
  MICROPHONE_STOPPED: 'SESSION_MEDIA',
  SCREEN_SHARE_STARTED: 'SESSION_MEDIA',
  SCREEN_SHARE_STOPPED: 'SESSION_MEDIA',
  PROCTORING_STARTED: 'SESSION_MEDIA',
  PROCTORING_STOPPED: 'SESSION_MEDIA',
  PROCTORING_HEARTBEAT: 'SESSION_MEDIA',
  PROCTORING_ERROR: 'SESSION_MEDIA',
});

/**
 * Returns the functional category of an event type.
 * Defaults to 'SESSION_MEDIA' if unrecognized.
 */
function classifyEvent(type) {
  if (!type || typeof type !== 'string') return 'SESSION_MEDIA';
  return EVENT_CATEGORIES[type.trim()] || 'SESSION_MEDIA';
}

/**
 * Evaluates pairwise correlation rules between two events if they fall
 * within windowMs of each other. Returns array of matching relationship objects.
 */
function evaluatePairwiseRelationships(eventA, eventB, windowMs = CORRELATION_WINDOW_MS) {
  const relationships = [];
  const timeA = new Date(eventA.timestamp).getTime();
  const timeB = new Date(eventB.timestamp).getTime();
  const deltaMs = Math.abs(timeB - timeA);

  if (deltaMs > windowMs) {
    return relationships;
  }

  const startTime = new Date(Math.min(timeA, timeB));
  const endTime = new Date(Math.max(timeA, timeB));
  const idA = String(eventA._id || eventA.id || 'a');
  const idB = String(eventB._id || eventB.id || 'b');
  const eventIds = [idA, idB].sort();

  const typeA = eventA.type;
  const typeB = eventB.type;

  const hasPair = (t1, t2) =>
    (typeA === t1 && typeB === t2) || (typeA === t2 && typeB === t1);

  // Rule A — Focus / Visibility relationship
  if (hasPair('FOCUS_LOST', 'PAGE_HIDDEN')) {
    relationships.push({
      type: 'FOCUS_VISIBILITY_ALIGNMENT',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule B — Focus return relationship
  if (hasPair('FOCUS_REGAINED', 'PAGE_VISIBLE')) {
    relationships.push({
      type: 'FOCUS_VISIBILITY_RETURN',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule C — Face absence + browser attention change
  if (
    (typeA === 'FACE_ABSENT' && ['FOCUS_LOST', 'PAGE_HIDDEN', 'FULLSCREEN_EXITED'].includes(typeB)) ||
    (typeB === 'FACE_ABSENT' && ['FOCUS_LOST', 'PAGE_HIDDEN', 'FULLSCREEN_EXITED'].includes(typeA))
  ) {
    relationships.push({
      type: 'FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule D — Screen change + browser attention change
  if (
    (typeA === 'SCREEN_VIEW_CHANGED' && ['FOCUS_LOST', 'PAGE_HIDDEN', 'FULLSCREEN_EXITED'].includes(typeB)) ||
    (typeB === 'SCREEN_VIEW_CHANGED' && ['FOCUS_LOST', 'PAGE_HIDDEN', 'FULLSCREEN_EXITED'].includes(typeA))
  ) {
    relationships.push({
      type: 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule E — Multiple faces + screen change
  if (hasPair('MULTIPLE_FACES', 'SCREEN_VIEW_CHANGED')) {
    relationships.push({
      type: 'MULTIPLE_FACES_WITH_SCREEN_CHANGE',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule F — Screen capture interruption
  if (hasPair('SCREEN_VIEW_UNAVAILABLE', 'SCREEN_SHARE_STOPPED')) {
    relationships.push({
      type: 'SCREEN_CAPTURE_INTERRUPTION',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  // Rule G — Camera media interruption
  if (hasPair('CAMERA_STOPPED', 'FACE_ABSENT')) {
    relationships.push({
      type: 'CAMERA_MEDIA_INTERRUPTION',
      eventIds,
      startTime,
      endTime,
      deltaMs,
    });
  }

  return relationships;
}

/**
 * Resolves authoritative answer interaction context if an answer in the session
 * was recorded with answeredAt falling within the episode window [startedAt - 1000ms, endedAt + 1000ms].
 */
function resolveAnswerInteractionContext(startedAt, endedAt, mockTestSession, mockTest) {
  if (!mockTestSession || !Array.isArray(mockTestSession.answers) || mockTestSession.answers.length === 0) {
    return null;
  }

  const startMs = startedAt.getTime() - 1000;
  const endMs = endedAt.getTime() + 1000;

  // Find answers that have an authoritative answeredAt within the episode range
  const candidateAnswers = mockTestSession.answers.filter((ans) => {
    if (!ans.answeredAt) return false;
    const ansMs = new Date(ans.answeredAt).getTime();
    return ansMs >= startMs && ansMs <= endMs;
  });

  if (candidateAnswers.length === 0) {
    return null;
  }

  // Pick the answer closest to the episode start time
  candidateAnswers.sort((a, b) => {
    const diffA = Math.abs(new Date(a.answeredAt).getTime() - startedAt.getTime());
    const diffB = Math.abs(new Date(b.answeredAt).getTime() - startedAt.getTime());
    return diffA - diffB;
  });

  const bestAnswer = candidateAnswers[0];
  let questionNumber = null;
  let section = bestAnswer.section ? String(bestAnswer.section).toUpperCase() : null;

  if (mockTest && Array.isArray(mockTest.questions)) {
    const qIndex = mockTest.questions.findIndex((q) => q.id === bestAnswer.questionId);
    if (qIndex !== -1) {
      questionNumber = qIndex + 1;
      if (!section && mockTest.questions[qIndex].section) {
        section = String(mockTest.questions[qIndex].section).toUpperCase();
      }
    }
  }

  return {
    questionId: bestAnswer.questionId,
    questionNumber: questionNumber || 1,
    section: section || 'UNKNOWN',
    answeredAt: new Date(bestAnswer.answeredAt),
  };
}

/**
 * Deterministically correlates a sequence of raw proctoring events into bounded episodes
 * and pairwise observable relationships.
 *
 * @param {Array<Object>} events - Array of ProctoringEvent objects
 * @param {Object} options - Configuration options
 * @returns {Array<Object>} Array of structured episode objects
 */
function correlateEvents(events = [], options = {}) {
  const windowMs = Number(options.windowMs) || CORRELATION_WINDOW_MS;
  const maxClusterDurationMs = Number(options.maxClusterDurationMs) || MAX_CLUSTER_DURATION_MS;
  const mockTestSession = options.mockTestSession || null;
  const mockTest = options.mockTest || null;

  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  // Step 1: Remove routine background heartbeats; keep all meaningful signals
  const meaningfulEvents = events.filter((e) => e.type !== 'PROCTORING_HEARTBEAT');
  if (meaningfulEvents.length === 0) {
    return [];
  }

  // Step 2: Ensure chronological order based strictly on server timestamp
  const sortedEvents = [...meaningfulEvents].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  // Step 3: Bounded Temporal Clustering
  // Form clusters where each event is within windowMs of the preceding event,
  // bounded by maxClusterDurationMs from cluster origin to prevent indefinite extension.
  const clusters = [];
  let currentCluster = [sortedEvents[0]];

  for (let i = 1; i < sortedEvents.length; i++) {
    const currentEvent = sortedEvents[i];
    const prevEvent = currentCluster[currentCluster.length - 1];
    const firstEvent = currentCluster[0];

    const currentMs = new Date(currentEvent.timestamp).getTime();
    const prevMs = new Date(prevEvent.timestamp).getTime();
    const firstMs = new Date(firstEvent.timestamp).getTime();

    const deltaPrev = currentMs - prevMs;
    const clusterSpan = currentMs - firstMs;

    // Both quiet period condition and bounded maximum duration condition must hold
    if (deltaPrev <= windowMs && clusterSpan <= maxClusterDurationMs) {
      currentCluster.push(currentEvent);
    } else {
      clusters.push(currentCluster);
      currentCluster = [currentEvent];
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // Step 4: Construct structured episodes from clusters
  const episodes = clusters.map((cluster) => {
    const firstEvent = cluster[0];
    const lastEvent = cluster[cluster.length - 1];

    const startedAt = new Date(firstEvent.timestamp);
    const endedAt = new Date(lastEvent.timestamp);
    const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());

    const eventIds = cluster.map((e) => e._id || e.id);
    const signalTypes = [...new Set(cluster.map((e) => e.type))];

    // Detect pairwise relationships within cluster (deduplicated by type and sorted eventIds)
    const relationships = [];
    const relKeys = new Set();

    for (let j = 0; j < cluster.length; j++) {
      for (let k = j + 1; k < cluster.length; k++) {
        const foundRels = evaluatePairwiseRelationships(cluster[j], cluster[k], windowMs);
        for (const rel of foundRels) {
          const key = `${rel.type}_${rel.eventIds.join('_')}`;
          if (!relKeys.has(key)) {
            relKeys.add(key);
            relationships.push(rel);
          }
        }
      }
    }

    // Resolve authoritative answer interaction context
    const answerInteractionContext = resolveAnswerInteractionContext(
      startedAt,
      endedAt,
      mockTestSession,
      mockTest
    );

    // Compute episode summary
    const categories = [...new Set(signalTypes.map((t) => classifyEvent(t)))];
    const relationshipTypes = [...new Set(relationships.map((r) => r.type))];

    return {
      proctoringSession: firstEvent.proctoringSession || null,
      mockTestSession: firstEvent.mockTestSession || (mockTestSession ? mockTestSession._id : null),
      user: firstEvent.user || (mockTestSession ? mockTestSession.user : null),
      startedAt,
      endedAt,
      durationMs,
      eventIds,
      signalTypes,
      relationships,
      answerInteractionContext,
      summary: {
        eventCount: cluster.length,
        categories,
        relationshipTypes,
      },
    };
  });

  return episodes;
}

/**
 * Helper to safely resolve Mongoose query or mock object.
 */
async function resolveDoc(query) {
  if (!query) return null;
  if (typeof query.lean === 'function') {
    return await query.lean();
  }
  return await query;
}

/**
 * Idempotently synchronizes derived ProctoringEpisode records for a given mock test session.
 * Recomputes deterministically from authoritative ProctoringEvent collection.
 *
 * @param {string|mongoose.Types.ObjectId} mockSessionId
 * @returns {Promise<{ episodes: Array<Object>, totalEpisodes: number }>}
 */
async function syncSessionEpisodes(mockSessionId) {
  const mockSession = await resolveDoc(MockTestSession.findById(mockSessionId));
  if (!mockSession) {
    const error = new Error('Mock test session not found.');
    error.statusCode = 404;
    throw error;
  }

  const procSession = await resolveDoc(ProctoringSession.findOne({ mockTestSession: mockSession._id }));
  if (!procSession) {
    const error = new Error('Associated proctoring session not found.');
    error.statusCode = 404;
    throw error;
  }

  const mockTest = mockSession.mockTest ? await resolveDoc(MockTest.findById(mockSession.mockTest)) : null;

  let eventsQuery = ProctoringEvent.find({ proctoringSession: procSession._id });
  if (typeof eventsQuery.sort === 'function') {
    eventsQuery = eventsQuery.sort({ timestamp: 1 });
  }
  const events = (await resolveDoc(eventsQuery)) || [];

  const correlated = correlateEvents(events, {
    mockTestSession: mockSession,
    mockTest,
    windowMs: CORRELATION_WINDOW_MS,
    maxClusterDurationMs: MAX_CLUSTER_DURATION_MS,
  });

  // Idempotent persistence: replace existing derived records for this session
  await ProctoringEpisode.deleteMany({ proctoringSession: procSession._id });

  const episodeDocs = correlated.map((ep) => ({
    ...ep,
    proctoringSession: procSession._id,
    mockTestSession: mockSession._id,
    user: mockSession.user,
  }));

  let savedEpisodes = [];
  if (episodeDocs.length > 0) {
    savedEpisodes = await ProctoringEpisode.insertMany(episodeDocs);
  }

  return {
    episodes: savedEpisodes,
    totalEpisodes: savedEpisodes.length,
  };
}

module.exports = {
  CORRELATION_WINDOW_MS,
  MAX_CLUSTER_DURATION_MS,
  EVENT_CATEGORIES,
  classifyEvent,
  evaluatePairwiseRelationships,
  resolveAnswerInteractionContext,
  correlateEvents,
  syncSessionEpisodes,
};
