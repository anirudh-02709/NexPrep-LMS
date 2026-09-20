const { classifyEvent } = require('./temporalCorrelationService');

/**
 * Format timestamp as HH:MM:SS string in UTC for deterministic readable output.
 */
function formatTimeUTC(dateInput) {
  if (!dateInput) return '00:00:00';
  const d = new Date(dateInput);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Generates neutral, factual description for an OBSERVED raw proctoring event.
 */
function generateObservedDescription(event) {
  const timeStr = formatTimeUTC(event.timestamp);
  const durSec = event.duration ? (event.duration / 1000).toFixed(1) : null;

  switch (event.type) {
    case 'FOCUS_LOST':
      return `At ${timeStr}, browser window blur was recorded.`;
    case 'FOCUS_REGAINED':
      return `At ${timeStr}, browser window focus was restored.`;
    case 'PAGE_HIDDEN':
      return `At ${timeStr}, document visibility transitioned to hidden.`;
    case 'PAGE_VISIBLE':
      return `At ${timeStr}, document visibility transitioned to visible.`;
    case 'FULLSCREEN_ENTERED':
      return `At ${timeStr}, fullscreen mode was entered.`;
    case 'FULLSCREEN_EXITED':
      return `At ${timeStr}, fullscreen mode was exited.`;
    case 'BEFORE_UNLOAD':
      return `At ${timeStr}, window beforeunload trigger was recorded.`;
    case 'FACE_PRESENT':
      return `At ${timeStr}, qualifying face presence was detected.`;
    case 'FACE_ABSENT':
      return durSec
        ? `At ${timeStr}, face absence was observed for approximately ${durSec} seconds.`
        : `At ${timeStr}, face absence was observed.`;
    case 'MULTIPLE_FACES':
      return durSec
        ? `At ${timeStr}, multiple faces were detected for approximately ${durSec} seconds.`
        : `At ${timeStr}, multiple faces were detected.`;
    case 'HEAD_POSE_DEVIATION':
      return durSec
        ? `At ${timeStr}, head pose deviation exceeded configured threshold for approximately ${durSec} seconds.`
        : `At ${timeStr}, head pose deviation exceeded configured threshold.`;
    case 'SCREEN_SURFACE_IDENTIFIED': {
      const surface = event.metadata?.displaySurface || 'surface';
      const w = event.metadata?.width || 0;
      const h = event.metadata?.height || 0;
      return `At ${timeStr}, display capture surface was initialized (${surface}, ${w}x${h}).`;
    }
    case 'SCREEN_VIEW_STABLE':
      return `At ${timeStr}, screen view characteristics stabilized matching expected exam layout.`;
    case 'SCREEN_VIEW_CHANGED':
      return durSec
        ? `At ${timeStr}, screen view characteristics changed relative to baseline for approximately ${durSec} seconds.`
        : `At ${timeStr}, screen view characteristics changed relative to baseline.`;
    case 'SCREEN_VIEW_UNAVAILABLE':
      return `At ${timeStr}, screen capture track became unavailable.`;
    case 'CAMERA_STARTED':
      return `At ${timeStr}, camera media track was started.`;
    case 'CAMERA_STOPPED':
      return `At ${timeStr}, camera media track was stopped.`;
    case 'MICROPHONE_STARTED':
      return `At ${timeStr}, microphone media track was started.`;
    case 'MICROPHONE_STOPPED':
      return `At ${timeStr}, microphone media track was stopped.`;
    case 'SCREEN_SHARE_STARTED':
      return `At ${timeStr}, screen share stream was initiated.`;
    case 'SCREEN_SHARE_STOPPED':
      return `At ${timeStr}, screen share stream was stopped.`;
    case 'PROCTORING_STARTED':
      return `At ${timeStr}, proctoring monitoring session started.`;
    case 'PROCTORING_STOPPED':
      return `At ${timeStr}, proctoring monitoring session stopped.`;
    case 'PROCTORING_ERROR':
      return `At ${timeStr}, proctoring client error was recorded.`;
    default:
      return `At ${timeStr}, proctoring signal '${event.type}' was recorded.`;
  }
}

/**
 * Generates neutral, factual description for a DERIVED temporal relationship.
 */
function generateDerivedDescription(relationship) {
  const delta = relationship.deltaMs || 0;
  const deltaSec = (delta / 1000).toFixed(1);

  switch (relationship.type) {
    case 'FOCUS_VISIBILITY_ALIGNMENT':
      return `Browser focus loss was observed alongside page visibility change within ${delta} ms (${deltaSec}s).`;
    case 'FOCUS_VISIBILITY_RETURN':
      return `Browser focus restoration was observed alongside page visibility return within ${delta} ms (${deltaSec}s).`;
    case 'FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE':
      return `Face absence was observed alongside browser attention state change within ${delta} ms (${deltaSec}s).`;
    case 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE':
      return `Screen view characteristic change was observed alongside browser attention state change within ${delta} ms (${deltaSec}s).`;
    case 'MULTIPLE_FACES_WITH_SCREEN_CHANGE':
      return `Multiple face detection occurred near a screen view characteristic change within ${delta} ms (${deltaSec}s).`;
    case 'SCREEN_CAPTURE_INTERRUPTION':
      return `Screen capture unavailability coincided with screen share track stoppage within ${delta} ms (${deltaSec}s).`;
    case 'CAMERA_MEDIA_INTERRUPTION':
      return `Camera media track stoppage coincided with face absence within ${delta} ms (${deltaSec}s).`;
    default:
      return `Temporal relationship '${relationship.type}' was observed with delta ${delta} ms.`;
  }
}

/**
 * Extracts all evidence items (OBSERVED, DERIVED) and indexes them deterministically.
 *
 * @param {Array<Object>} events - Raw ProctoringEvent documents
 * @param {Array<Object>} episodes - Derived ProctoringEpisode documents
 * @returns {Array<Object>} Array of structured evidence records
 */
function extractEvidence(events = [], episodes = []) {
  const evidenceList = [];

  // 1. Build map of eventId -> episodeId
  const eventToEpisodeMap = new Map();
  episodes.forEach((ep, epIdx) => {
    const epId = String(ep._id || ep.id || `ep_${epIdx + 1}`);
    (ep.eventIds || []).forEach((evId) => {
      eventToEpisodeMap.set(String(evId), epId);
    });
  });

  // 2. Extract OBSERVED evidence from raw events (excluding background heartbeats)
  // Apply deterministic chronological ordering with secondary ID tie-breaking
  // NOTE: All raw events are preserved (no deletion or deduplication)
  const nonHeartbeatEvents = events
    .filter((e) => e.type !== 'PROCTORING_HEARTBEAT')
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const idA = String(a._id || a.id || '');
      const idB = String(b._id || b.id || '');
      return idA.localeCompare(idB);
    });
  nonHeartbeatEvents.forEach((ev, idx) => {
    const evId = String(ev._id || ev.id || `ev_${idx + 1}`);
    const episodeId = eventToEpisodeMap.get(evId) || null;
    const durMs = Number(ev.duration) || 0;
    const startTime = new Date(ev.timestamp);
    const endTime = new Date(startTime.getTime() + durMs);

    evidenceList.push({
      id: `ev_obs_${idx + 1}`,
      type: 'OBSERVED',
      source: ev.source || 'browser',
      eventType: ev.type,
      eventIds: [evId],
      episodeId,
      startedAt: startTime,
      endedAt: endTime,
      durationMs: durMs,
      description: generateObservedDescription(ev),
      metadata: ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {},
    });
  });

  // 3. Extract DERIVED evidence from Phase 5 episode relationships
  let relCounter = 1;
  episodes.forEach((ep, epIdx) => {
    const epId = String(ep._id || ep.id || `ep_${epIdx + 1}`);
    (ep.relationships || []).forEach((rel) => {
      const relEventIds = (rel.eventIds || []).map(String);
      evidenceList.push({
        id: `ev_der_${relCounter++}`,
        type: 'DERIVED',
        relationshipType: rel.type,
        eventIds: relEventIds,
        episodeId: epId,
        deltaMs: Number(rel.deltaMs) || 0,
        description: generateDerivedDescription(rel),
      });
    });
  });

  return evidenceList;
}

/**
 * Computes objective summary statistics from authoritative session, event, and episode data.
 */
function computeStatistics(events = [], episodes = [], mockSession = null, procSession = null) {
  const nonHeartbeatEvents = events
    .filter((e) => e.type !== 'PROCTORING_HEARTBEAT')
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const idA = String(a._id || a.id || '');
      const idB = String(b._id || b.id || '');
      return idA.localeCompare(idB);
    });

  // Compute session duration
  let sessionDurationMs = 0;
  if (procSession?.startedAt && procSession?.endedAt) {
    sessionDurationMs = Math.max(0, new Date(procSession.endedAt).getTime() - new Date(procSession.startedAt).getTime());
  } else if (procSession?.startedAt && procSession?.lastHeartbeatAt) {
    sessionDurationMs = Math.max(0, new Date(procSession.lastHeartbeatAt).getTime() - new Date(procSession.startedAt).getTime());
  } else if (nonHeartbeatEvents.length >= 2) {
    const firstTime = new Date(nonHeartbeatEvents[0].timestamp).getTime();
    const lastTime = new Date(nonHeartbeatEvents[nonHeartbeatEvents.length - 1].timestamp).getTime();
    sessionDurationMs = Math.max(0, lastTime - firstTime);
  }

  // Count occurrences of event types
  const eventCounts = {};
  nonHeartbeatEvents.forEach((e) => {
    eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
  });

  // Count episodes by category
  const episodeCountsByCategory = {
    ATTENTION: 0,
    CAMERA: 0,
    SCREEN: 0,
    SESSION_MEDIA: 0,
  };
  episodes.forEach((ep) => {
    const cats = ep.summary?.categories || [];
    cats.forEach((cat) => {
      if (episodeCountsByCategory[cat] !== undefined) {
        episodeCountsByCategory[cat]++;
      }
    });
  });

  // Count relationships by type
  const relationshipCounts = {};
  let totalRelationships = 0;
  episodes.forEach((ep) => {
    (ep.relationships || []).forEach((r) => {
      totalRelationships++;
      relationshipCounts[r.type] = (relationshipCounts[r.type] || 0) + 1;
    });
  });

  // Derive historical interruption counts
  const cameraStopCount = eventCounts.CAMERA_STOPPED || 0;
  const screenShareStopCount = eventCounts.SCREEN_SHARE_STOPPED || 0;
  const screenUnavailableCount = eventCounts.SCREEN_VIEW_UNAVAILABLE || 0;
  const fullscreenExitCount = eventCounts.FULLSCREEN_EXITED || 0;

  const cameraInterruptions = cameraStopCount;
  const screenInterruptions = screenShareStopCount + screenUnavailableCount;
  const fullscreenExits = fullscreenExitCount;

  // Compute longest durations
  let longestFaceAbsenceMs = 0;
  let longestScreenChangeEpisodeMs = 0;
  nonHeartbeatEvents.forEach((e) => {
    const dur = Number(e.duration) || 0;
    if (e.type === 'FACE_ABSENT' && dur > longestFaceAbsenceMs) {
      longestFaceAbsenceMs = dur;
    }
    if (e.type === 'SCREEN_VIEW_CHANGED' && dur > longestScreenChangeEpisodeMs) {
      longestScreenChangeEpisodeMs = dur;
    }
  });

  let longestAttentionEpisodeMs = 0;
  episodes.forEach((ep) => {
    const hasAttention = (ep.signalTypes || []).some((s) => classifyEvent(s) === 'ATTENTION');
    if (hasAttention && (ep.durationMs || 0) > longestAttentionEpisodeMs) {
      longestAttentionEpisodeMs = ep.durationMs;
    }
  });

  return {
    sessionDurationMs,
    totalEvents: nonHeartbeatEvents.length,
    totalEpisodes: episodes.length,
    totalRelationships,
    eventCounts,
    episodeCountsByCategory,
    relationshipCounts,
    cameraInterruptions,
    screenInterruptions,
    fullscreenExits,
    longestFaceAbsenceMs,
    longestAttentionEpisodeMs,
    longestScreenChangeEpisodeMs,
  };
}

/**
 * Builds chronological timeline episodes with evidence references and template narratives.
 */
function buildTimeline(episodes = [], evidenceList = []) {
  // Map eventId to observed evidenceId
  const eventIdToEvidenceId = new Map();
  evidenceList.forEach((ev) => {
    if (ev.type === 'OBSERVED' && ev.eventIds && ev.eventIds.length > 0) {
      eventIdToEvidenceId.set(ev.eventIds[0], ev.id);
    }
  });

  return episodes.map((ep, idx) => {
    const epId = String(ep._id || ep.id || `ep_${idx + 1}`);
    const matchedEvidenceIds = [];

    (ep.eventIds || []).forEach((evId) => {
      const eid = eventIdToEvidenceId.get(String(evId));
      if (eid && !matchedEvidenceIds.includes(eid)) {
        matchedEvidenceIds.push(eid);
      }
    });

    // Formulate deterministic template narrative
    const startStr = formatTimeUTC(ep.startedAt);
    const endStr = formatTimeUTC(ep.endedAt);
    const durSec = ((ep.durationMs || 0) / 1000).toFixed(1);
    const signals = ep.signalTypes || [];

    let narrative = `Episode from ${startStr} to ${endStr} (duration: ${durSec}s) encompassing signals: ${signals.join(', ')}.`;
    if (ep.relationships && ep.relationships.length > 0) {
      const relTexts = ep.relationships.map((r) => `${r.type} (delta: ${r.deltaMs}ms)`).join('; ');
      narrative += ` Temporal associations observed: ${relTexts}.`;
    }

    return {
      id: `tl_${idx + 1}`,
      episodeId: epId,
      startedAt: new Date(ep.startedAt),
      endedAt: new Date(ep.endedAt),
      durationMs: ep.durationMs || 0,
      signals,
      evidenceIds: matchedEvidenceIds,
      answerInteractionContext: ep.answerInteractionContext || null,
      narrative,
    };
  });
}

/**
 * Builds temporal relationship items with evidence references.
 */
function buildRelationships(episodes = [], evidenceList = []) {
  const relationships = [];
  let relIdCounter = 1;

  // Map of derived evidence by relationshipType and episodeId
  const derivedMap = new Map();
  evidenceList.forEach((ev) => {
    if (ev.type === 'DERIVED') {
      const key = `${ev.episodeId}_${ev.relationshipType}`;
      derivedMap.set(key, ev.id);
    }
  });

  // Map of eventId to observed evidenceId
  const eventIdToEvidenceId = new Map();
  evidenceList.forEach((ev) => {
    if (ev.type === 'OBSERVED' && ev.eventIds && ev.eventIds.length > 0) {
      eventIdToEvidenceId.set(ev.eventIds[0], ev.id);
    }
  });

  episodes.forEach((ep, epIdx) => {
    const epId = String(ep._id || ep.id || `ep_${epIdx + 1}`);
    (ep.relationships || []).forEach((rel) => {
      const relatedEvidenceIds = [];

      // Link constituent observed evidence IDs
      (rel.eventIds || []).forEach((evId) => {
        const obsId = eventIdToEvidenceId.get(String(evId));
        if (obsId && !relatedEvidenceIds.includes(obsId)) {
          relatedEvidenceIds.push(obsId);
        }
      });

      // Link the derived evidence ID
      const derId = derivedMap.get(`${epId}_${rel.type}`);
      if (derId && !relatedEvidenceIds.includes(derId)) {
        relatedEvidenceIds.push(derId);
      }

      relationships.push({
        id: `rel_${relIdCounter++}`,
        type: rel.type,
        deltaMs: rel.deltaMs,
        episodeId: epId,
        startTime: new Date(rel.startTime),
        endTime: new Date(rel.endTime),
        evidenceIds: relatedEvidenceIds,
        description: generateDerivedDescription(rel),
      });
    });
  });

  return relationships;
}

/**
 * Builds technical observations section (hardware state changes, interruptions).
 */
function buildTechnicalObservations(events = [], evidenceList = []) {
  const technicalTypes = [
    'CAMERA_STARTED',
    'CAMERA_STOPPED',
    'SCREEN_SHARE_STARTED',
    'SCREEN_SHARE_STOPPED',
    'SCREEN_VIEW_UNAVAILABLE',
    'FULLSCREEN_EXITED',
    'PROCTORING_ERROR',
  ];

  const obsList = [];
  const eventIdToEvidenceId = new Map();
  evidenceList.forEach((ev) => {
    if (ev.type === 'OBSERVED' && ev.eventIds && ev.eventIds.length > 0) {
      eventIdToEvidenceId.set(ev.eventIds[0], ev.id);
    }
  });

  events
    .filter((e) => technicalTypes.includes(e.type))
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const idA = String(a._id || a.id || '');
      const idB = String(b._id || b.id || '');
      return idA.localeCompare(idB);
    })
    .forEach((e, idx) => {
      const evId = String(e._id || e.id || `tech_${idx + 1}`);
      const evidenceId = eventIdToEvidenceId.get(evId);
      obsList.push({
        id: `tech_${idx + 1}`,
        type: e.type,
        timestamp: new Date(e.timestamp),
        evidenceIds: evidenceId ? [evidenceId] : [],
        description: generateObservedDescription(e),
      });
    });

  return obsList;
}

/**
 * Builds explicit unknowns and telemetry limitations section.
 */
function buildUnknowns(events = [], evidenceList = []) {
  const unknowns = [];
  let unkCounter = 1;

  const eventTypesPresent = new Set(events.map((e) => e.type));

  const getEvidenceIdsForTypes = (types) => {
    return evidenceList
      .filter((ev) => ev.type === 'OBSERVED' && types.includes(ev.eventType))
      .map((ev) => ev.id);
  };

  // Screen limitation
  if (eventTypesPresent.has('SCREEN_VIEW_CHANGED')) {
    unknowns.push({
      id: `unk_${unkCounter++}`,
      category: 'SCREEN',
      description:
        'The captured screen-view change does not identify the specific application, window, or content responsible for the change.',
      applicableEvidenceIds: getEvidenceIdsForTypes(['SCREEN_VIEW_CHANGED']),
    });
  }

  // Face absence limitation
  if (eventTypesPresent.has('FACE_ABSENT')) {
    unknowns.push({
      id: `unk_${unkCounter++}`,
      category: 'CAMERA',
      description:
        'Face absence means that the configured detector did not observe a qualifying face during the stabilized interval. It does not establish why the face was not detected.',
      applicableEvidenceIds: getEvidenceIdsForTypes(['FACE_ABSENT']),
    });
  }

  // Head pose limitation
  if (eventTypesPresent.has('HEAD_POSE_DEVIATION')) {
    unknowns.push({
      id: `unk_${unkCounter++}`,
      category: 'CAMERA',
      description:
        'Head-pose deviation indicates that the estimated pose exceeded the configured threshold. It does not establish what the student was looking at.',
      applicableEvidenceIds: getEvidenceIdsForTypes(['HEAD_POSE_DEVIATION']),
    });
  }

  // Multiple faces limitation
  if (eventTypesPresent.has('MULTIPLE_FACES')) {
    unknowns.push({
      id: `unk_${unkCounter++}`,
      category: 'CAMERA',
      description:
        'Multiple-face detection establishes that more than one qualifying face was detected. It does not establish who the additional person was or what they were doing.',
      applicableEvidenceIds: getEvidenceIdsForTypes(['MULTIPLE_FACES']),
    });
  }

  // Browser attention limitation
  if (eventTypesPresent.has('FOCUS_LOST') || eventTypesPresent.has('PAGE_HIDDEN')) {
    unknowns.push({
      id: `unk_${unkCounter++}`,
      category: 'ATTENTION',
      description:
        'Browser focus or visibility changes do not establish user intent or what occurred outside the captured browser context.',
      applicableEvidenceIds: getEvidenceIdsForTypes(['FOCUS_LOST', 'PAGE_HIDDEN']),
    });
  }

  return unknowns;
}

/**
 * Synthesizes the complete, evidence-grounded, deterministic proctoring report.
 *
 * @param {Object} mockSession - MockTestSession document
 * @param {Object} procSession - ProctoringSession document
 * @param {Object} mockTest - MockTest template document
 * @param {Array<Object>} events - Raw ProctoringEvent documents
 * @param {Array<Object>} episodes - Derived ProctoringEpisode documents
 * @returns {Object} Structured proctoring report
 */
function synthesizeReport(mockSession, procSession, mockTest, events = [], episodes = []) {
  const evidenceList = extractEvidence(events, episodes);
  const statistics = computeStatistics(events, episodes, mockSession, procSession);

  // Derive historical metrics for proctoring overview (do not hide interruptions behind final state)
  const cameraStarted = events.some((e) => e.type === 'CAMERA_STARTED');
  const screenShareStarted = events.some((e) => e.type === 'SCREEN_SHARE_STARTED');
  const fullscreenEntered = events.some((e) => e.type === 'FULLSCREEN_ENTERED');

  const proctoringOverview = {
    cameraStarted,
    cameraStopCount: statistics.cameraInterruptions,
    finalCameraState: procSession?.cameraState || 'inactive',
    screenShareStarted,
    screenShareStopCount: statistics.screenInterruptions,
    finalScreenShareState: procSession?.screenShareState || 'inactive',
    fullscreenEntered,
    fullscreenExitCount: statistics.fullscreenExits,
    finalFullscreenState: procSession?.fullscreenState || 'inactive',
    totalEpisodes: episodes.length,
    totalRelationships: statistics.totalRelationships,
  };

  const sessionOverview = {
    testTitle: mockTest?.title || 'JEE Main Mock Test',
    status: mockSession?.status || 'completed',
    durationMinutes: mockTest?.duration || 60,
    totalQuestions: mockTest?.totalQuestions || (mockSession?.answers ? mockSession.answers.length : 30),
    score: mockSession?.result?.score !== undefined ? mockSession.result.score : null,
    maxMarks: mockSession?.result?.maxMarks !== undefined ? mockSession.result.maxMarks : null,
    startedAt: mockSession?.startedAt ? new Date(mockSession.startedAt) : null,
    submittedAt: mockSession?.submittedAt ? new Date(mockSession.submittedAt) : null,
  };

  const timeline = buildTimeline(episodes, evidenceList);
  const relationships = buildRelationships(episodes, evidenceList);
  const technicalObservations = buildTechnicalObservations(events, evidenceList);
  const unknowns = buildUnknowns(events, evidenceList);

  return {
    sessionOverview,
    proctoringOverview,
    statistics,
    timeline,
    relationships,
    technicalObservations,
    unknowns,
    evidence: evidenceList,
  };
}

module.exports = {
  extractEvidence,
  computeStatistics,
  buildTimeline,
  buildRelationships,
  buildTechnicalObservations,
  buildUnknowns,
  synthesizeReport,
};
