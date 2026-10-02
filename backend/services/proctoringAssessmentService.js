/**
 * proctoringAssessmentService.js
 *
 * Deterministic Proctoring Assessment Engine for NexPrep JEE LMS.
 *
 * Evaluates authoritative proctoring events, derived episodes, and session states
 * against explicit, rule-based criteria to determine whether an attempt requires review.
 *
 * Strictly adheres to architectural safety principles:
 * - Pure, deterministic evaluation: identical inputs produce identical substantive outputs.
 * - Zero LLM dependencies, zero model randomness, zero opaque risk/cheating scores.
 * - No intent inference: observes only technical conditions and corroborated discrepancies.
 * - Raw events remain immutable and append-only.
 * - Tri-state assessment: CLEAR, REVIEW_REQUIRED, or INSUFFICIENT_DATA.
 *
 * Note: Thresholds in 'proctoring-v1' are initial engineering values, not empirically validated values.
 */

const { correlateEvents } = require('./temporalCorrelationService');

const PROCTORING_RULESET_VERSION = 'proctoring-v1';

/**
 * Centralized, versioned initial engineering thresholds.
 */
const DEFAULT_CONFIG = Object.freeze({
  ruleSetVersion: PROCTORING_RULESET_VERSION,

  // Rule 1: Correlated Face Absence and Attention Change (Phase 5 Rule C)
  rule1_faceAbsentAttention: {
    minOccurrences: 2,
    singleDurationThresholdMs: 15000,
  },

  // Rule 2: Correlated Screen View Change and Attention Change (Phase 5 Rule D)
  rule2_screenChangeAttention: {
    minOccurrences: 2,
    singleDurationThresholdMs: 10000,
  },

  // Rule 3: Multiple Faces (Raw MULTIPLE_FACES or Rule E)
  rule3_multipleFaces: {
    singleDurationThresholdMs: 10000,
    minEpisodes: 2,
    cumulativeDurationThresholdMs: 5000,
  },

  // Rule 4: Head Pose Deviation
  rule4_headPoseDeviation: {
    cumulativeDurationThresholdMs: 45000,
    minEpisodes: 5,
  },

  // Rule 5: Browser Focus / Visibility Discrepancies
  rule5_browserFocusVisibility: {
    minFocusLostCount: 4,
    cumulativeFocusLostDurationMs: 30000,
    minFullscreenExits: 3,
  },

  // Rule 6: Sustained Face Absence
  rule6_faceAbsent: {
    singleDurationThresholdMs: 30000,
    cumulativeDurationThresholdMs: 60000,
    minEpisodes: 4,
  },

  // Rule 7: Media Interruption During Active Exam
  rule7_mediaInterruption: {
    minUnrecoveredDurationMs: 10000,
    materialCoverageRatio: 0.70, // stream must be active for >= 70% of active test
  },
});

/**
 * Deterministically sorts events by server timestamp, breaking ties by MongoDB _id / id.
 * Pure function: does not mutate input array.
 *
 * @param {Array<Object>} events
 * @returns {Array<Object>}
 */
function sortEventsDeterministically(events = []) {
  return [...events].sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    if (tA !== tB) return tA - tB;
    const idA = String(a._id || a.id || '');
    const idB = String(b._id || b.id || '');
    return idA.localeCompare(idB);
  });
}

/**
 * Evaluates whether proctoring data is sufficient for reliable assessment.
 * Based strictly on actual monitoring lifecycle and capabilities present in repository.
 *
 * @param {Object|null} procSession
 * @param {Array<Object>} sortedEvents
 * @param {Object|null} mockSession
 * @param {Object} options
 * @returns {{ isSufficient: boolean, issues: Array<string> }}
 */
function evaluateTelemetrySufficiency(procSession, sortedEvents, mockSession, options = {}) {
  const issues = [];

  // 1. Proctoring session must exist
  if (!procSession) {
    issues.push('Proctoring session was never initiated for this exam attempt.');
    return { isSufficient: false, issues };
  }

  // 2. Webcam CV capability check
  const cvUnavailableOption = options.cvStatus === 'unavailable';
  const cvUnavailableMetadata = procSession.metadata && procSession.metadata.cvStatus === 'unavailable';
  const cameraDenied = procSession.cameraState === 'denied' || procSession.cameraState === 'unsupported';
  const hasCameraStarted = sortedEvents.some((e) => e.type === 'CAMERA_STARTED');
  const hasFaceObservations = sortedEvents.some((e) =>
    ['FACE_PRESENT', 'FACE_ABSENT', 'MULTIPLE_FACES', 'HEAD_POSE_DEVIATION'].includes(e.type)
  );

  if (cvUnavailableOption || cvUnavailableMetadata || cameraDenied) {
    issues.push('Webcam computer-vision pipeline was unavailable or permission was denied.');
  } else if (!hasCameraStarted && procSession.cameraState !== 'active' && !hasFaceObservations) {
    // Neither camera started event nor any CV observation occurred
    issues.push('Webcam video stream was never activated during the examination.');
  }

  // 3. Screen monitoring capability check
  const screenUnavailableOption = options.screenAiStatus === 'unavailable';
  const screenUnavailableMetadata = procSession.metadata && procSession.metadata.screenAiStatus === 'unavailable';
  const screenDenied = procSession.screenShareState === 'denied' || procSession.screenShareState === 'unsupported';
  const hasScreenStarted = sortedEvents.some((e) => e.type === 'SCREEN_SHARE_STARTED');
  const hasScreenObservations = sortedEvents.some((e) =>
    ['SCREEN_SURFACE_IDENTIFIED', 'SCREEN_VIEW_STABLE', 'SCREEN_VIEW_CHANGED'].includes(e.type)
  );

  if (screenUnavailableOption || screenUnavailableMetadata || screenDenied) {
    issues.push('Screen capture monitoring pipeline was unavailable or permission was denied.');
  } else if (!hasScreenStarted && procSession.screenShareState !== 'active' && !hasScreenObservations) {
    issues.push('Screen capture stream was never activated during the examination.');
  }

  // 4. Material stream coverage check during active exam
  // Check if media stream was stopped for a significant portion (> 30%) of active exam duration
  if (mockSession?.startedAt && (mockSession?.submittedAt || mockSession?.expiresAt)) {
    const startMs = new Date(mockSession.startedAt).getTime();
    const endMs = new Date(mockSession.submittedAt || mockSession.expiresAt).getTime();
    const activeDurationMs = Math.max(1, endMs - startMs);

    // Sum unrecovered camera stoppage during active exam
    let cumulativeCameraStoppageMs = 0;
    const cameraStopEvents = sortedEvents.filter(
      (e) => e.type === 'CAMERA_STOPPED' && (!e.metadata || e.metadata.reason !== 'exam_submitted')
    );

    cameraStopEvents.forEach((stopEv) => {
      const stopMs = new Date(stopEv.timestamp).getTime();
      const restartEv = sortedEvents.find(
        (e) => e.type === 'CAMERA_STARTED' && new Date(e.timestamp).getTime() > stopMs
      );
      const resumedMs = restartEv ? new Date(restartEv.timestamp).getTime() : endMs;
      cumulativeCameraStoppageMs += Math.max(0, resumedMs - stopMs);
    });

    if (cumulativeCameraStoppageMs / activeDurationMs > (1 - DEFAULT_CONFIG.rule7_mediaInterruption.materialCoverageRatio)) {
      issues.push(
        `Webcam stream was stopped for ${Math.round(cumulativeCameraStoppageMs / 1000)}s (> 30% of exam duration).`
      );
    }
  }

  return {
    isSufficient: issues.length === 0,
    issues,
  };
}

/**
 * Pure, deterministic evaluation of proctoring assessment.
 *
 * @param {Array<Object>} events - Raw ProctoringEvent documents/objects
 * @param {Array<Object>} episodes - Derived ProctoringEpisode documents/objects
 * @param {Object|null} mockSession - MockTestSession document/object
 * @param {Object|null} procSession - ProctoringSession document/object
 * @param {Object} options - Configuration overrides and execution flags
 * @returns {Object} Structured ProctoringAssessment payload
 */
function evaluateProctoringAssessment(events = [], episodes = [], mockSession = null, procSession = null, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(options.config || {}),
  };

  // Step 1: Deterministic sort of raw events
  const sortedEvents = sortEventsDeterministically(events);

  // Build ID lookup maps for fast event resolution
  const eventMap = new Map();
  sortedEvents.forEach((e) => {
    const id = String(e._id || e.id || '');
    if (id) eventMap.set(id, e);
  });

  // Step 2: Resolve effective episodes (use provided episodes, or correlate deterministically if omitted)
  const effectiveEpisodes =
    Array.isArray(episodes) && episodes.length > 0
      ? episodes
      : correlateEvents(sortedEvents, {
          mockTestSession: mockSession,
          windowMs: 3000,
        });

  const episodeMap = new Map();
  effectiveEpisodes.forEach((ep, idx) => {
    const id = String(ep._id || ep.id || `ep_${idx + 1}`);
    episodeMap.set(id, ep);
  });

  // Filter out routine heartbeats for metrics calculation
  const nonHeartbeatEvents = sortedEvents.filter((e) => e.type !== 'PROCTORING_HEARTBEAT');

  // Step 3: Evaluate Deterministic Flagging Rules
  const triggeredRules = [];

  // ─── RULE 1: Face Absence + Browser Attention Change (Rule C) ──────
  const rule1Relationships = [];
  effectiveEpisodes.forEach((ep) => {
    (ep.relationships || []).forEach((rel) => {
      if (rel.type === 'FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE') {
        rule1Relationships.push({ rel, episode: ep });
      }
    });
  });

  let rule1MaxDurationMs = 0;
  const rule1EventIds = new Set();
  const rule1EpisodeIds = new Set();
  let rule1HasAnswer = false;

  rule1Relationships.forEach(({ rel, episode }) => {
    rule1EpisodeIds.add(String(episode._id || episode.id || ''));
    (rel.eventIds || []).forEach((id) => {
      rule1EventIds.add(String(id));
      const ev = eventMap.get(String(id));
      if (ev && ev.type === 'FACE_ABSENT') {
        const dur = Number(ev.duration) || (ev.metadata && Number(ev.metadata.confirmedDurationMs)) || 0;
        if (dur > rule1MaxDurationMs) rule1MaxDurationMs = dur;
      }
    });
    if (episode.durationMs > rule1MaxDurationMs) {
      rule1MaxDurationMs = episode.durationMs;
    }
    if (episode.answerInteractionContext) {
      rule1HasAnswer = true;
    }
  });

  const rule1Triggered =
    rule1Relationships.length >= config.rule1_faceAbsentAttention.minOccurrences ||
    rule1MaxDurationMs > config.rule1_faceAbsentAttention.singleDurationThresholdMs;

  if (rule1Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_1_FACE_ABSENT_ATTENTION',
      ruleName: 'Correlated Face Absence and Attention Change',
      category: 'ATTENTION',
      observedCount: rule1Relationships.length,
      threshold: config.rule1_faceAbsentAttention.minOccurrences,
      durationMs: rule1MaxDurationMs,
      evidenceEventIds: [...rule1EventIds].filter(Boolean),
      episodeIds: [...rule1EpisodeIds].filter(Boolean),
      answerCoincident: rule1HasAnswer,
    });
  }

  // ─── RULE 2: Screen View Change + Browser Attention Change (Rule D) ───
  const rule2Relationships = [];
  effectiveEpisodes.forEach((ep) => {
    (ep.relationships || []).forEach((rel) => {
      if (rel.type === 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE') {
        rule2Relationships.push({ rel, episode: ep });
      }
    });
  });

  let rule2MaxDurationMs = 0;
  const rule2EventIds = new Set();
  const rule2EpisodeIds = new Set();
  let rule2HasAnswer = false;

  rule2Relationships.forEach(({ rel, episode }) => {
    rule2EpisodeIds.add(String(episode._id || episode.id || ''));
    (rel.eventIds || []).forEach((id) => {
      rule2EventIds.add(String(id));
      const ev = eventMap.get(String(id));
      if (ev && ev.type === 'SCREEN_VIEW_CHANGED') {
        const dur = Number(ev.duration) || (ev.metadata && Number(ev.metadata.confirmedDurationMs)) || 0;
        if (dur > rule2MaxDurationMs) rule2MaxDurationMs = dur;
      }
    });
    if (episode.durationMs > rule2MaxDurationMs) {
      rule2MaxDurationMs = episode.durationMs;
    }
    if (episode.answerInteractionContext) {
      rule2HasAnswer = true;
    }
  });

  const rule2Triggered =
    rule2Relationships.length >= config.rule2_screenChangeAttention.minOccurrences ||
    rule2MaxDurationMs > config.rule2_screenChangeAttention.singleDurationThresholdMs;

  if (rule2Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_2_SCREEN_CHANGE_ATTENTION',
      ruleName: 'Correlated Screen View Change and Attention Change',
      category: 'SCREEN',
      observedCount: rule2Relationships.length,
      threshold: config.rule2_screenChangeAttention.minOccurrences,
      durationMs: rule2MaxDurationMs,
      evidenceEventIds: [...rule2EventIds].filter(Boolean),
      episodeIds: [...rule2EpisodeIds].filter(Boolean),
      answerCoincident: rule2HasAnswer,
    });
  }

  // ─── RULE 3: Multiple Faces ───────────────────────────────────────
  const multipleFaceEvents = nonHeartbeatEvents.filter((e) => e.type === 'MULTIPLE_FACES');
  const multipleFaceEpisodes = effectiveEpisodes.filter((ep) =>
    (ep.signalTypes || []).includes('MULTIPLE_FACES')
  );

  let rule3MaxDurationMs = 0;
  let rule3CumulativeDurationMs = 0;
  const rule3EventIds = new Set();
  const rule3EpisodeIds = new Set();
  let rule3HasAnswer = false;

  multipleFaceEvents.forEach((ev) => {
    rule3EventIds.add(String(ev._id || ev.id || ''));
    const dur = Number(ev.duration) || (ev.metadata && Number(ev.metadata.confirmedDurationMs)) || 0;
    rule3CumulativeDurationMs += dur;
    if (dur > rule3MaxDurationMs) rule3MaxDurationMs = dur;
  });

  multipleFaceEpisodes.forEach((ep) => {
    rule3EpisodeIds.add(String(ep._id || ep.id || ''));
    if (ep.answerInteractionContext) rule3HasAnswer = true;
  });

  const rule3Triggered =
    rule3MaxDurationMs > config.rule3_multipleFaces.singleDurationThresholdMs ||
    (multipleFaceEpisodes.length >= config.rule3_multipleFaces.minEpisodes &&
      rule3CumulativeDurationMs > config.rule3_multipleFaces.cumulativeDurationThresholdMs);

  if (rule3Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_3_MULTIPLE_FACES',
      ruleName: 'Multiple Faces Detected',
      category: 'CAMERA',
      observedCount: multipleFaceEpisodes.length || multipleFaceEvents.length,
      threshold: config.rule3_multipleFaces.minEpisodes,
      durationMs: rule3MaxDurationMs,
      evidenceEventIds: [...rule3EventIds].filter(Boolean),
      episodeIds: [...rule3EpisodeIds].filter(Boolean),
      answerCoincident: rule3HasAnswer,
    });
  }

  // ─── RULE 4: Head Pose Deviation ──────────────────────────────────
  const poseEvents = nonHeartbeatEvents.filter((e) => e.type === 'HEAD_POSE_DEVIATION');
  const poseEpisodes = effectiveEpisodes.filter((ep) =>
    (ep.signalTypes || []).includes('HEAD_POSE_DEVIATION')
  );

  let rule4CumulativeDurationMs = 0;
  const rule4EventIds = new Set();
  const rule4EpisodeIds = new Set();
  let rule4HasAnswer = false;

  poseEvents.forEach((ev) => {
    rule4EventIds.add(String(ev._id || ev.id || ''));
    const dur = Number(ev.duration) || (ev.metadata && Number(ev.metadata.confirmedDurationMs)) || 0;
    rule4CumulativeDurationMs += dur;
  });

  poseEpisodes.forEach((ep) => {
    rule4EpisodeIds.add(String(ep._id || ep.id || ''));
    if (ep.answerInteractionContext) rule4HasAnswer = true;
  });

  const poseCount = poseEpisodes.length || poseEvents.length;
  const rule4Triggered =
    rule4CumulativeDurationMs >= config.rule4_headPoseDeviation.cumulativeDurationThresholdMs ||
    poseCount >= config.rule4_headPoseDeviation.minEpisodes;

  if (rule4Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_4_HEAD_POSE_DEVIATION',
      ruleName: 'Sustained or Repeated Head Pose Deviation',
      category: 'CAMERA',
      observedCount: poseCount,
      threshold: config.rule4_headPoseDeviation.minEpisodes,
      durationMs: rule4CumulativeDurationMs,
      evidenceEventIds: [...rule4EventIds].filter(Boolean),
      episodeIds: [...rule4EpisodeIds].filter(Boolean),
      answerCoincident: rule4HasAnswer,
    });
  }

  // ─── RULE 5: Browser Focus / Visibility Discrepancies ─────────────
  const focusLostEvents = nonHeartbeatEvents.filter((e) => e.type === 'FOCUS_LOST');
  const focusRegainedEvents = nonHeartbeatEvents.filter((e) => e.type === 'FOCUS_REGAINED');
  const fullscreenExitedEvents = nonHeartbeatEvents.filter((e) => e.type === 'FULLSCREEN_EXITED');

  let rule5CumulativeFocusLostMs = 0;
  const rule5EventIds = new Set();
  const rule5EpisodeIds = new Set();
  let rule5HasAnswer = false;

  focusLostEvents.forEach((ev) => {
    rule5EventIds.add(String(ev._id || ev.id || ''));
  });

  // Prefer completed duration carried by FOCUS_REGAINED to prevent double-counting
  if (focusRegainedEvents.length > 0) {
    focusRegainedEvents.forEach((ev) => {
      rule5EventIds.add(String(ev._id || ev.id || ''));
      rule5CumulativeFocusLostMs +=
        Number(ev.duration) ||
        (ev.metadata && Number(ev.metadata.durationMs)) ||
        (ev.metadata && Number(ev.metadata.confirmedDurationMs)) ||
        0;
    });
  } else {
    // Fallback: If no FOCUS_REGAINED exists, extract from FOCUS_LOST (e.g. unclosed intervals or test fixtures)
    focusLostEvents.forEach((ev) => {
      rule5CumulativeFocusLostMs +=
        Number(ev.duration) ||
        (ev.metadata && Number(ev.metadata.durationMs)) ||
        (ev.metadata && Number(ev.metadata.confirmedDurationMs)) ||
        0;
    });
  }

  fullscreenExitedEvents.forEach((ev) => {
    rule5EventIds.add(String(ev._id || ev.id || ''));
  });

  // Also check duration of attention episodes
  effectiveEpisodes.forEach((ep) => {
    const hasFocusSignal = (ep.signalTypes || []).some((s) =>
      ['FOCUS_LOST', 'FOCUS_REGAINED', 'PAGE_HIDDEN', 'PAGE_VISIBLE', 'FULLSCREEN_EXITED'].includes(s)
    );
    if (hasFocusSignal) {
      rule5EpisodeIds.add(String(ep._id || ep.id || ''));
      if (ep.answerInteractionContext) rule5HasAnswer = true;
    }
  });

  const rule5Triggered =
    focusLostEvents.length >= config.rule5_browserFocusVisibility.minFocusLostCount ||
    rule5CumulativeFocusLostMs >= config.rule5_browserFocusVisibility.cumulativeFocusLostDurationMs ||
    fullscreenExitedEvents.length >= config.rule5_browserFocusVisibility.minFullscreenExits;

  if (rule5Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_5_BROWSER_FOCUS_VISIBILITY',
      ruleName: 'Repeated Browser Focus or Visibility Discrepancies',
      category: 'ATTENTION',
      observedCount: focusLostEvents.length + fullscreenExitedEvents.length,
      threshold: config.rule5_browserFocusVisibility.minFocusLostCount,
      durationMs: rule5CumulativeFocusLostMs,
      evidenceEventIds: [...rule5EventIds].filter(Boolean),
      episodeIds: [...rule5EpisodeIds].filter(Boolean),
      answerCoincident: rule5HasAnswer,
    });
  }

  // ─── RULE 6: Sustained Face Absence ───────────────────────────────
  const faceAbsentEvents = nonHeartbeatEvents.filter((e) => e.type === 'FACE_ABSENT');
  const faceAbsentEpisodes = effectiveEpisodes.filter((ep) =>
    (ep.signalTypes || []).includes('FACE_ABSENT')
  );

  let rule6MaxDurationMs = 0;
  let rule6CumulativeDurationMs = 0;
  const rule6EventIds = new Set();
  const rule6EpisodeIds = new Set();
  let rule6HasAnswer = false;

  faceAbsentEvents.forEach((ev) => {
    rule6EventIds.add(String(ev._id || ev.id || ''));
    const dur = Number(ev.duration) || (ev.metadata && Number(ev.metadata.confirmedDurationMs)) || 0;
    rule6CumulativeDurationMs += dur;
    if (dur > rule6MaxDurationMs) rule6MaxDurationMs = dur;
  });

  faceAbsentEpisodes.forEach((ep) => {
    rule6EpisodeIds.add(String(ep._id || ep.id || ''));
    if (ep.answerInteractionContext) rule6HasAnswer = true;
  });

  const faceAbsentCount = faceAbsentEpisodes.length || faceAbsentEvents.length;
  const rule6Triggered =
    rule6MaxDurationMs >= config.rule6_faceAbsent.singleDurationThresholdMs ||
    rule6CumulativeDurationMs >= config.rule6_faceAbsent.cumulativeDurationThresholdMs ||
    faceAbsentCount >= config.rule6_faceAbsent.minEpisodes;

  if (rule6Triggered) {
    triggeredRules.push({
      ruleId: 'RULE_6_SUSTAINED_FACE_ABSENCE',
      ruleName: 'Sustained or Repeated Face Absence',
      category: 'CAMERA',
      observedCount: faceAbsentCount,
      threshold: config.rule6_faceAbsent.minEpisodes,
      durationMs: rule6MaxDurationMs,
      evidenceEventIds: [...rule6EventIds].filter(Boolean),
      episodeIds: [...rule6EpisodeIds].filter(Boolean),
      answerCoincident: rule6HasAnswer,
    });
  }

  // ─── RULE 7: Media Interruption During Active Exam ────────────────
  // Note: Teardown on submit (metadata.reason === 'exam_submitted') is strictly EXEMPT.
  const activeMediaStoppages = nonHeartbeatEvents.filter((e) => {
    const isMediaStop =
      e.type === 'CAMERA_STOPPED' ||
      e.type === 'SCREEN_SHARE_STOPPED' ||
      e.type === 'SCREEN_VIEW_UNAVAILABLE';
    const isTeardown = e.metadata && e.metadata.reason === 'exam_submitted';
    return isMediaStop && !isTeardown;
  });

  let rule7Triggered = false;
  const rule7EventIds = new Set();
  const rule7EpisodeIds = new Set();

  activeMediaStoppages.forEach((stopEv) => {
    const stopMs = new Date(stopEv.timestamp).getTime();
    rule7EventIds.add(String(stopEv._id || stopEv.id || ''));

    // Check if subsequent restart occurred within minUnrecoveredDurationMs
    const restartType = stopEv.type === 'CAMERA_STOPPED' ? 'CAMERA_STARTED' : 'SCREEN_SHARE_STARTED';
    const restartEv = nonHeartbeatEvents.find(
      (e) => e.type === restartType && new Date(e.timestamp).getTime() > stopMs
    );

    if (!restartEv) {
      // Unrecovered media stoppage during active exam
      rule7Triggered = true;
    } else {
      const unrecoveredMs = new Date(restartEv.timestamp).getTime() - stopMs;
      if (unrecoveredMs > config.rule7_mediaInterruption.minUnrecoveredDurationMs) {
        rule7Triggered = true;
      }
    }
  });

  if (rule7Triggered && activeMediaStoppages.length > 0) {
    triggeredRules.push({
      ruleId: 'RULE_7_MEDIA_INTERRUPTION',
      ruleName: 'Media Stream Interruption During Active Exam',
      category: 'INTEGRITY',
      observedCount: activeMediaStoppages.length,
      threshold: 1,
      durationMs: 0,
      evidenceEventIds: [...rule7EventIds].filter(Boolean),
      episodeIds: [...rule7EpisodeIds].filter(Boolean),
      answerCoincident: false,
    });
  }

  // Step 4: Evaluate Telemetry Sufficiency
  const sufficiency = evaluateTelemetrySufficiency(procSession, sortedEvents, mockSession, options);

  // Step 5: Deterministic Conflict Precedence & Status Assignment
  // Policy:
  // 1. If positive review conditions were triggered -> REVIEW_REQUIRED takes precedence,
  //    and any telemetry degradation is documented in metrics/summary.
  // 2. If no review rules triggered, but telemetry was insufficient -> INSUFFICIENT_DATA.
  // 3. If no review rules triggered and telemetry was sufficient -> CLEAR.
  let status = 'CLEAR';
  let summary = 'No configured proctoring review condition was triggered by the available technical observations.';

  if (triggeredRules.length > 0) {
    status = 'REVIEW_REQUIRED';
    const ruleNames = triggeredRules.map((r) => r.ruleName).join('; ');
    summary = `Sufficient technical observations exceeded configured review conditions and require further review: ${ruleNames}.`;
    if (!sufficiency.isSufficient) {
      summary += ` Note: monitoring telemetry was also flagged as degraded (${sufficiency.issues.join('; ')}).`;
    }
  } else if (!sufficiency.isSufficient) {
    status = 'INSUFFICIENT_DATA';
    summary = `Monitoring data was insufficient or materially degraded to make the automatic assessment reliable: ${sufficiency.issues.join('; ')}.`;
  }

  // Step 6: Construct Metrics Payload
  const metrics = {
    totalEvents: nonHeartbeatEvents.length,
    totalEpisodes: effectiveEpisodes.length,
    totalDiscrepancies: triggeredRules.length,
    focusLostCount: focusLostEvents.length,
    cumulativeFocusLostDurationMs: rule5CumulativeFocusLostMs,
    fullscreenExitCount: fullscreenExitedEvents.length,
    faceAbsentCount,
    cumulativeFaceAbsentDurationMs: rule6CumulativeDurationMs,
    multipleFacesCount: multipleFaceEpisodes.length || multipleFaceEvents.length,
    headPoseDeviationCount: poseCount,
    cumulativeHeadPoseDurationMs: rule4CumulativeDurationMs,
    cameraInterruptions: sortedEvents.filter((e) => e.type === 'CAMERA_STOPPED').length,
    screenInterruptions: sortedEvents.filter(
      (e) => e.type === 'SCREEN_SHARE_STOPPED' || e.type === 'SCREEN_VIEW_UNAVAILABLE'
    ).length,
    telemetrySufficiency: sufficiency.isSufficient ? 'SUFFICIENT' : 'INSUFFICIENT',
    telemetryIssues: sufficiency.issues,
  };

  return {
    mockTestSession: mockSession ? mockSession._id || mockSession.id : null,
    proctoringSession: procSession ? procSession._id || procSession.id : null,
    user: mockSession ? mockSession.user : procSession ? procSession.user : null,
    status,
    ruleSetVersion: PROCTORING_RULESET_VERSION,
    triggeredRules,
    metrics,
    summary,
  };
}

module.exports = {
  PROCTORING_RULESET_VERSION,
  DEFAULT_CONFIG,
  sortEventsDeterministically,
  evaluateTelemetrySufficiency,
  evaluateProctoringAssessment,
};
