/**
 * proctoringAdjudicationService.js
 *
 * NexPrep JEE LMS — Automated Proctoring Adjudication Engine (Phase B)
 *
 * Fully autonomous, server-authoritative proctoring adjudication engine implementing
 * the definitive frozen Phase A specification (PHASE_A_FROZEN_SPECIFICATION.md).
 *
 * Core Architecture:
 * - Tri-dimensional evaluation:
 *     1. Integrity Risk (R in [0, 100])
 *     2. Evidence Confidence (C in [0.0, 1.0])
 *     3. Technical Health (H in {SUFFICIENT, INSUFFICIENT})
 * - Autonomous tri-state outcomes: RELEASE, VOID, TECHNICAL
 * - 6-stage deterministic event preprocessing pipeline
 * - Inviolable channel suppression & downstream absorption for MEDIA
 * - Single universal piecewise duration function mu_D(t)
 * - Cross-category corroboration multiplier kappa(V)
 * - Category risk caps (20/35/35/35) guaranteeing no single category can trigger VOID (max 35 < 50)
 * - Additive compounding (+15 pts for >= 2 categories with CatRisk >= 10)
 * - Additive answer context adjustment (Delta R_ans = +8 pts)
 * - Strict 5-rule decision hierarchy: Rule 1 (HV) -> Rule 2 (High Risk) -> Rule 3 (Tech Protection) -> Rule 4 (Release) -> Rule 5 (Fail-Safe)
 */

// ============================================================================
// 1. CONSTANTS & FROZEN PARAMETERS
// ============================================================================

const ADJUDICATION_MODEL_VERSION = 'phase-a-v1';

const CATEGORIES = Object.freeze({
  ATTENTION: 'ATTENTION',
  CAMERA: 'CAMERA',
  SCREEN: 'SCREEN',
  MEDIA: 'MEDIA',
});

const CATEGORY_CAPS = Object.freeze({
  ATTENTION: 20,
  CAMERA: 35,
  SCREEN: 35,
  MEDIA: 35,
});

const DECISIONS = Object.freeze({
  RELEASE: 'RELEASE',
  VOID: 'VOID',
  TECHNICAL: 'TECHNICAL',
});

const TECHNICAL_HEALTH = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  INSUFFICIENT: 'INSUFFICIENT',
});

const REASON_CODES = Object.freeze({
  CLEAN_SUBMISSION: 'CLEAN_SUBMISSION',
  ADVISORY_ANOMALIES_RECORDED: 'ADVISORY_ANOMALIES_RECORDED',
  HARD_VIOLATION_CONFIRMED: 'HARD_VIOLATION_CONFIRMED',
  HIGH_RISK_HIGH_CONFIDENCE: 'HIGH_RISK_HIGH_CONFIDENCE',
  CORROBORATED_MULTI_VECTOR_BREACH: 'CORROBORATED_MULTI_VECTOR_BREACH',
  TECHNICAL_DEGRADATION: 'TECHNICAL_DEGRADATION',
  INSUFFICIENT_CONFIDENCE: 'INSUFFICIENT_CONFIDENCE',
  FAIL_SAFE_TECHNICAL_HOLD: 'FAIL_SAFE_TECHNICAL_HOLD',
  UNRECOVERED_MEDIA_BLACKOUT: 'UNRECOVERED_MEDIA_BLACKOUT',
  STREAM_CONTINUITY_DEGRADED: 'STREAM_CONTINUITY_DEGRADED',
  SENSOR_INIT_INCOMPLETE: 'SENSOR_INIT_INCOMPLETE',
  HEARTBEAT_DISRUPTED: 'HEARTBEAT_DISRUPTED',
  LOW_CONFIDENCE_TELEMETRY: 'LOW_CONFIDENCE_TELEMETRY',
});

// Event type to Category mapping
const EVENT_CATEGORY_MAP = Object.freeze({
  // Attention
  FOCUS_LOST: CATEGORIES.ATTENTION,
  FOCUS_REGAINED: CATEGORIES.ATTENTION,
  PAGE_HIDDEN: CATEGORIES.ATTENTION,
  PAGE_VISIBLE: CATEGORIES.ATTENTION,
  BROWSER_ATTENTION_LOSS: CATEGORIES.ATTENTION,
  FULLSCREEN_ENTERED: CATEGORIES.ATTENTION,
  FULLSCREEN_EXITED: CATEGORIES.ATTENTION,
  BEFORE_UNLOAD: CATEGORIES.ATTENTION,

  // Camera
  FACE_PRESENT: CATEGORIES.CAMERA,
  FACE_ABSENT: CATEGORIES.CAMERA,
  MULTIPLE_FACES: CATEGORIES.CAMERA,
  MULTIPLE_FACES_DETECTED: CATEGORIES.CAMERA,
  HEAD_POSE_DEVIATION: CATEGORIES.CAMERA,
  VOICE_DETECTED: CATEGORIES.CAMERA,
  AUDIO_SPIKE: CATEGORIES.CAMERA,

  // Screen
  SCREEN_SURFACE_IDENTIFIED: CATEGORIES.SCREEN,
  SCREEN_VIEW_STABLE: CATEGORIES.SCREEN,
  SCREEN_VIEW_CHANGED: CATEGORIES.SCREEN,
  SCREEN_VIEW_UNAVAILABLE: CATEGORIES.SCREEN,
  SCREEN_WINDOW_BLUR: CATEGORIES.SCREEN,

  // Media
  CAMERA_STARTED: CATEGORIES.MEDIA,
  CAMERA_STOPPED: CATEGORIES.MEDIA,
  MICROPHONE_STARTED: CATEGORIES.MEDIA,
  MICROPHONE_STOPPED: CATEGORIES.MEDIA,
  SCREEN_SHARE_STARTED: CATEGORIES.MEDIA,
  SCREEN_SHARE_STOPPED: CATEGORIES.MEDIA,
  PROCTORING_STARTED: CATEGORIES.MEDIA,
  PROCTORING_STOPPED: CATEGORIES.MEDIA,
  PROCTORING_HEARTBEAT: CATEGORIES.MEDIA,
  PROCTORING_ERROR: CATEGORIES.MEDIA,
});

// Base Weights W0 and minimum noise floors
const BASE_WEIGHTS = Object.freeze({
  BROWSER_ATTENTION_LOSS: { first: 0, repeat: 4, minDurationMs: 3000 },
  FULLSCREEN_EXITED: { first: 0, repeat: 4, minDurationMs: 3000 },
  HEAD_POSE_DEVIATION: { first: 4, repeat: 4, minDurationMs: 1000 },
  FACE_ABSENT: { first: 8, repeat: 8, minDurationMs: 1000 },
  MULTIPLE_FACES: { first: 12, repeat: 12, minDurationMs: 750 },
  MULTIPLE_FACES_DETECTED: { first: 12, repeat: 12, minDurationMs: 750 },
  SCREEN_VIEW_CHANGED: { first: 12, repeat: 12, minDurationMs: 1500 },
  SCREEN_VIEW_UNAVAILABLE: { first: 12, repeat: 12, minDurationMs: 1500 },
});

// Initial calibration thresholds
const THRESHOLDS = Object.freeze({
  CONFIDENCE_HIGH_BOUNDARY: 0.75,
  CONFIDENCE_PRIOR_BOUNDARY: 0.75,
  HEALTH_CONTINUITY_BOUNDARY: 0.70,
  RISK_RELEASE_MAX: 50,
  RISK_ADVISORY_MIN: 25,
  CORRELATION_WINDOW_MS: 3000,
  CLUSTER_SPAN_CAP_MS: 30000,
  DEBOUNCE_WINDOW_MS: 1500,
  HARD_VIOLATION_BLACKOUT_MS: 60000,
  COMPOUNDING_CATEGORY_QUALIFYING_PTS: 10,
  COMPOUNDING_PTS: 15,
  ANSWER_CONTEXT_PTS: 8,
});

// ============================================================================
// 2. MATHEMATICAL HELPER FUNCTIONS
// ============================================================================

/**
 * Universal Piecewise Duration Function mu_D(t)
 * Section 2D of Frozen Spec:
 *   t < 3000ms: 0.0
 *   3000ms <= t <= 10000ms: 1.0
 *   10000ms < t <= 30000ms: 1.5
 *   30000ms < t <= 60000ms: 2.0
 *   t > 60000ms: 2.5
 *
 * @param {number} durationMs - Raw incident duration in milliseconds
 * @returns {number} Multiplier in {0.0, 1.0, 1.5, 2.0, 2.5}
 */
function computeDurationMultiplier(durationMs) {
  const d = Math.max(0, Number(durationMs) || 0);
  if (d < 3000) return 0.0;
  if (d <= 10000) return 1.0;
  if (d <= 30000) return 1.5;
  if (d <= 60000) return 2.0;
  return 2.5;
}

/**
 * Cross-Category Corroboration Multiplier kappa(V)
 * Section 2G of Frozen Spec:
 *   V = 0: 1.0
 *   V = 1: 1.0
 *   V = 2: 1.5
 *   V = 3: 2.0
 *   V = 4: 2.5
 *
 * @param {number} distinctCategoriesCount - Count of distinct active categories in episode
 * @returns {number} Multiplier in {1.0, 1.5, 2.0, 2.5}
 */
function computeCorroborationMultiplier(distinctCategoriesCount) {
  const v = Math.max(0, Math.floor(Number(distinctCategoriesCount) || 0));
  if (v <= 1) return 1.0;
  if (v === 2) return 1.5;
  if (v === 3) return 2.0;
  return 2.5;
}

/**
 * Media Interruption Tier Evaluation
 * Section 2C of Frozen Spec:
 * Evaluates camera or screen media stoppage against strict 4-tier precedence:
 * - Tier 1: Transient <= 10s, recovered -> W0 = 0
 * - Tier 2: Prolonged > 10s, uncorroborated idle -> W0 = 0 (routes to H = INSUFFICIENT)
 * - Tier 3: Corroborated > 10s, concurrent attention divergence -> W0 = 15
 * - Tier 4: Multi-vector active breach > 30s, attention divergence + answers recorded -> W0 = 30
 *
 * @param {Object} params
 * @param {number} params.durationMs - Stoppage duration in ms
 * @param {boolean} params.isRecovered - Whether stream restarted before submission
 * @param {boolean} params.hasAttentionDivergence - Concurrent browser attention loss / fullscreen exit
 * @param {boolean} params.hasAnswersSubmitted - Answers recorded during stoppage
 * @returns {{ tier: number, weight: number, isTier2Stoppage: boolean }}
 */
function evaluateMediaTier({ durationMs, isRecovered = true, hasAttentionDivergence = false, hasAnswersSubmitted = false }) {
  const dur = Math.max(0, Number(durationMs) || 0);

  // Tier 4: Multi-Vector Active Breach (> 30s + attention + answers)
  if (dur > 30000 && hasAttentionDivergence && hasAnswersSubmitted) {
    return { tier: 4, weight: 30, isTier2Stoppage: false };
  }

  // Tier 3: Corroborated Interruption (> 10s + attention)
  if (dur > 10000 && hasAttentionDivergence) {
    return { tier: 3, weight: 15, isTier2Stoppage: false };
  }

  // Tier 2: Prolonged uncorroborated idle (> 10s)
  if (dur > 10000) {
    return { tier: 2, weight: 0, isTier2Stoppage: true };
  }

  // Tier 1: Transient <= 10s
  return { tier: 1, weight: 0, isTier2Stoppage: false };
}

// ============================================================================
// 3. 6-STAGE EVENT PREPROCESSING PIPELINE
// ============================================================================

/**
 * Stage 1 & 2: Ingestion & Deterministic Sequence Sorting
 * Section 2A:
 * Orders by:
 * 1. Server receipt / event timestamp ASC
 * 2. Monotonic sequence counter S_seq ASC
 * 3. MongoDB _id hex string comparison (localeCompare)
 * Clamps to active exam window [T_started, T_finalization].
 *
 * @param {Array<Object>} events - Raw telemetry events
 * @param {Object} testWindow - { startedAt, finalizationAt }
 * @returns {Array<Object>} Normalized, sorted events
 */
function normalizeEvents(events = [], testWindow = {}) {
  const startedAtMs = testWindow.startedAt ? new Date(testWindow.startedAt).getTime() : 0;
  const finalizationMs = testWindow.finalizationAt ? new Date(testWindow.finalizationAt).getTime() : Infinity;

  const validEvents = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || typeof ev !== 'object') continue;

    const rawTimestamp = ev.timestamp || ev.receivedAt || ev.createdAt;
    const ts = rawTimestamp ? new Date(rawTimestamp).getTime() : 0;

    // Filter events occurring outside active exam window
    if (startedAtMs > 0 && ts < startedAtMs) continue;
    if (finalizationMs < Infinity && ts > finalizationMs) continue;

    const dur = typeof ev.duration === 'number' && Number.isFinite(ev.duration) ? Math.max(0, ev.duration) : 0;

    validEvents.push({
      raw: ev,
      id: String(ev._id || ev.id || `ev_${i}`),
      type: String(ev.type || '').trim(),
      source: String(ev.source || 'browser'),
      timestamp: ts,
      duration: dur,
      seq: typeof ev.seq === 'number' ? ev.seq : i,
      metadata: ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {},
    });
  }

  // Deterministic 3-tuple sort
  return validEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.seq !== b.seq) return a.seq - b.seq;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Stage 3 & 4: Semantic Reconstruction, Channel Suppression & State Machine Normalization
 * Section 2B, 2E, 2F:
 * - Consolidates browser focus/visibility into BROWSER_ATTENTION_LOSS tokens
 * - Consolidates camera/screen failures
 * - Applies Channel Suppression / Downstream Absorption:
 *     - CAMERA_STOPPED absorbs downstream FACE_ABSENT & HEAD_POSE_DEVIATION
 *     - SCREEN_SHARE_STOPPED absorbs downstream SCREEN_VIEW_UNAVAILABLE & SCREEN_VIEW_CHANGED
 * - Debounces rapid duplicate telemetry (<= 1500ms)
 * - Session-wide occurrence grace (n=1 => W0=0, n>=2 => W0=4 for attention/fullscreen)
 * - Server-authoritative duration derivation & Teardown Flush at T_finalization
 *
 * @param {Array<Object>} sortedEvents
 * @param {Object} testWindow - { startedAt, finalizationAt }
 * @param {Array<number>} answerTimesMs - Sorted timestamps of submitted answers
 * @returns {{ tokens: Array<Object>, mediaStoppages: Array<Object>, tier2Count: number }}
 */
function reconstructSemanticFSM(sortedEvents = [], testWindow = {}, answerTimesMs = []) {
  const startedAtMs = testWindow.startedAt ? new Date(testWindow.startedAt).getTime() : 0;
  const finalizationMs = testWindow.finalizationAt ? new Date(testWindow.finalizationAt).getTime() : Date.now();

  const consolidatedTokens = [];
  const mediaStoppages = [];

  // Active open states
  let activeAttentionState = null; // { startTime, lastEventTime, sourceEvents, openType }
  let activeFullscreenState = null; // { startTime, lastEventTime, sourceEvents }
  let activeCameraState = null; // { isStopped, stopTime, restartTime, stopEvent }
  let activeScreenState = null; // { isStopped, stopTime, restartTime, stopEvent }

  // Occurrence tracking
  let attentionOccurrenceCount = 0;
  let fullscreenOccurrenceCount = 0;
  let tier2Count = 0;

  // Track debouncing of consecutive events
  let lastEventSignature = null;
  let lastEventTimestamp = 0;

  // Process chronological stream
  for (let idx = 0; idx < sortedEvents.length; idx++) {
    const ev = sortedEvents[idx];
    const ts = ev.timestamp;
    const type = ev.type;

    // 1500ms Debounce check for identical consecutive telemetry
    const sig = `${type}_${ev.source}`;
    if (sig === lastEventSignature && ts - lastEventTimestamp <= THRESHOLDS.DEBOUNCE_WINDOW_MS && ts >= lastEventTimestamp) {
      // Absorb bounce; if event specified explicit duration, extend duration
      continue;
    }
    lastEventSignature = sig;
    lastEventTimestamp = ts;

    // ─── CAMERA CHANNEL SUPPRESSION & LIFECYCLE ───────────────────────
    if (type === 'CAMERA_STOPPED') {
      if (!activeCameraState || !activeCameraState.isStopped) {
        activeCameraState = {
          isStopped: true,
          stopTime: ts,
          stopEvent: ev,
          restartTime: null,
        };
      }
      continue;
    }

    if (type === 'CAMERA_STARTED') {
      if (activeCameraState && activeCameraState.isStopped) {
        const stopTime = activeCameraState.stopTime;
        const dur = Math.max(0, ts - stopTime);
        activeCameraState.isStopped = false;
        activeCameraState.restartTime = ts;

        mediaStoppages.push({
          channel: 'CAMERA',
          startTime: stopTime,
          endTime: ts,
          durationMs: dur,
          isRecovered: true,
          event: activeCameraState.stopEvent,
        });
      }
      continue;
    }

    // ─── SCREEN CHANNEL SUPPRESSION & LIFECYCLE ───────────────────────
    if (type === 'SCREEN_SHARE_STOPPED') {
      if (!activeScreenState || !activeScreenState.isStopped) {
        activeScreenState = {
          isStopped: true,
          stopTime: ts,
          stopEvent: ev,
          restartTime: null,
        };
      }
      continue;
    }

    if (type === 'SCREEN_SHARE_STARTED') {
      if (activeScreenState && activeScreenState.isStopped) {
        const stopTime = activeScreenState.stopTime;
        const dur = Math.max(0, ts - stopTime);
        activeScreenState.isStopped = false;
        activeScreenState.restartTime = ts;

        mediaStoppages.push({
          channel: 'SCREEN',
          startTime: stopTime,
          endTime: ts,
          durationMs: dur,
          isRecovered: true,
          event: activeScreenState.stopEvent,
        });
      }
      continue;
    }

    // ─── CHANNEL SUPPRESSION ABSORPTION RULES ────────────────────────
    // If camera is stopped, absorb downstream CV artifacts
    if (activeCameraState && activeCameraState.isStopped) {
      if (type === 'FACE_ABSENT' || type === 'HEAD_POSE_DEVIATION') {
        // Suppressed and absorbed into the CAMERA_STOPPED incident
        continue;
      }
    }

    // If screen share is stopped, absorb downstream screen monitor artifacts
    if (activeScreenState && activeScreenState.isStopped) {
      if (type === 'SCREEN_VIEW_UNAVAILABLE' || type === 'SCREEN_VIEW_CHANGED') {
        // Suppressed and absorbed into the SCREEN_SHARE_STOPPED incident
        continue;
      }
    }

    // ─── ATTENTION FSM (FOCUS & VISIBILITY) ───────────────────────────
    if (type === 'FOCUS_LOST' || type === 'PAGE_HIDDEN' || type === 'BROWSER_ATTENTION_LOSS') {
      if (!activeAttentionState) {
        activeAttentionState = {
          startTime: ts,
          lastEventTime: ts,
          sourceEvents: [ev],
          openType: type,
        };
      } else {
        // Co-occurring within 3000ms or during active open interval
        activeAttentionState.sourceEvents.push(ev);
        activeAttentionState.lastEventTime = ts;
      }
      continue;
    }

    if (type === 'FOCUS_REGAINED' || type === 'PAGE_VISIBLE') {
      if (activeAttentionState) {
        activeAttentionState.sourceEvents.push(ev);
        const dur = Math.max(0, ts - activeAttentionState.startTime);

        attentionOccurrenceCount += 1;
        consolidatedTokens.push({
          id: `token_attn_${consolidatedTokens.length + 1}`,
          type: 'BROWSER_ATTENTION_LOSS',
          category: CATEGORIES.ATTENTION,
          startTime: activeAttentionState.startTime,
          endTime: ts,
          durationMs: dur,
          occurrenceIndex: attentionOccurrenceCount,
          isSuppressed: false,
          sourceEvents: activeAttentionState.sourceEvents,
        });
        activeAttentionState = null;
      }
      // Orphan end events are discarded
      continue;
    }

    // ─── FULLSCREEN FSM ──────────────────────────────────────────────
    if (type === 'FULLSCREEN_EXITED') {
      if (!activeFullscreenState) {
        activeFullscreenState = {
          startTime: ts,
          lastEventTime: ts,
          sourceEvents: [ev],
        };
      } else {
        activeFullscreenState.sourceEvents.push(ev);
      }
      continue;
    }

    if (type === 'FULLSCREEN_ENTERED') {
      if (activeFullscreenState) {
        activeFullscreenState.sourceEvents.push(ev);
        const dur = Math.max(0, ts - activeFullscreenState.startTime);

        fullscreenOccurrenceCount += 1;
        consolidatedTokens.push({
          id: `token_fs_${consolidatedTokens.length + 1}`,
          type: 'FULLSCREEN_EXITED',
          category: CATEGORIES.ATTENTION,
          startTime: activeFullscreenState.startTime,
          endTime: ts,
          durationMs: dur,
          occurrenceIndex: fullscreenOccurrenceCount,
          isSuppressed: false,
          sourceEvents: activeFullscreenState.sourceEvents,
        });
        activeFullscreenState = null;
      }
      continue;
    }

    // ─── INDEPENDENT CAMERA OBSERVATIONS (WHEN CAMERA ACTIVE) ────────
    if (type === 'FACE_ABSENT') {
      const dur = ev.duration > 0 ? ev.duration : (ev.metadata && ev.metadata.durationMs) || 0;
      consolidatedTokens.push({
        id: `token_face_absent_${consolidatedTokens.length + 1}`,
        type: 'FACE_ABSENT',
        category: CATEGORIES.CAMERA,
        startTime: ts,
        endTime: ts + dur,
        durationMs: dur,
        occurrenceIndex: 1,
        isSuppressed: false,
        sourceEvents: [ev],
      });
      continue;
    }

    if (type === 'MULTIPLE_FACES' || type === 'MULTIPLE_FACES_DETECTED') {
      const dur = ev.duration > 0 ? ev.duration : (ev.metadata && ev.metadata.durationMs) || 0;
      consolidatedTokens.push({
        id: `token_multi_faces_${consolidatedTokens.length + 1}`,
        type: 'MULTIPLE_FACES',
        category: CATEGORIES.CAMERA,
        startTime: ts,
        endTime: ts + dur,
        durationMs: dur,
        occurrenceIndex: 1,
        isSuppressed: false,
        sourceEvents: [ev],
      });
      continue;
    }

    if (type === 'HEAD_POSE_DEVIATION') {
      const dur = ev.duration > 0 ? ev.duration : (ev.metadata && ev.metadata.durationMs) || 0;
      consolidatedTokens.push({
        id: `token_head_pose_${consolidatedTokens.length + 1}`,
        type: 'HEAD_POSE_DEVIATION',
        category: CATEGORIES.CAMERA,
        startTime: ts,
        endTime: ts + dur,
        durationMs: dur,
        occurrenceIndex: 1,
        isSuppressed: false,
        sourceEvents: [ev],
      });
      continue;
    }

    // ─── INDEPENDENT SCREEN OBSERVATIONS (WHEN SCREEN ACTIVE) ────────
    if (type === 'SCREEN_VIEW_CHANGED') {
      const dur = ev.duration > 0 ? ev.duration : (ev.metadata && ev.metadata.durationMs) || 0;
      consolidatedTokens.push({
        id: `token_scr_changed_${consolidatedTokens.length + 1}`,
        type: 'SCREEN_VIEW_CHANGED',
        category: CATEGORIES.SCREEN,
        startTime: ts,
        endTime: ts + dur,
        durationMs: dur,
        occurrenceIndex: 1,
        isSuppressed: false,
        sourceEvents: [ev],
      });
      continue;
    }

    if (type === 'SCREEN_VIEW_UNAVAILABLE') {
      const dur = ev.duration > 0 ? ev.duration : (ev.metadata && ev.metadata.durationMs) || 0;
      consolidatedTokens.push({
        id: `token_scr_unavail_${consolidatedTokens.length + 1}`,
        type: 'SCREEN_VIEW_UNAVAILABLE',
        category: CATEGORIES.SCREEN,
        startTime: ts,
        endTime: ts + dur,
        durationMs: dur,
        occurrenceIndex: 1,
        isSuppressed: false,
        sourceEvents: [ev],
      });
      continue;
    }
  }

  // ─── TEARDOWN FLUSH FOR UNRESOLVED OPEN STATES AT T_FINALIZATION ────
  if (activeAttentionState) {
    const dur = Math.max(0, finalizationMs - activeAttentionState.startTime);
    attentionOccurrenceCount += 1;
    consolidatedTokens.push({
      id: `token_attn_flush_${consolidatedTokens.length + 1}`,
      type: 'BROWSER_ATTENTION_LOSS',
      category: CATEGORIES.ATTENTION,
      startTime: activeAttentionState.startTime,
      endTime: finalizationMs,
      durationMs: dur,
      occurrenceIndex: attentionOccurrenceCount,
      isSuppressed: false,
      sourceEvents: activeAttentionState.sourceEvents,
    });
    activeAttentionState = null;
  }

  if (activeFullscreenState) {
    const dur = Math.max(0, finalizationMs - activeFullscreenState.startTime);
    fullscreenOccurrenceCount += 1;
    consolidatedTokens.push({
      id: `token_fs_flush_${consolidatedTokens.length + 1}`,
      type: 'FULLSCREEN_EXITED',
      category: CATEGORIES.ATTENTION,
      startTime: activeFullscreenState.startTime,
      endTime: finalizationMs,
      durationMs: dur,
      occurrenceIndex: fullscreenOccurrenceCount,
      isSuppressed: false,
      sourceEvents: activeFullscreenState.sourceEvents,
    });
    activeFullscreenState = null;
  }

  if (activeCameraState && activeCameraState.isStopped) {
    const dur = Math.max(0, finalizationMs - activeCameraState.stopTime);
    mediaStoppages.push({
      channel: 'CAMERA',
      startTime: activeCameraState.stopTime,
      endTime: finalizationMs,
      durationMs: dur,
      isRecovered: false,
      event: activeCameraState.stopEvent,
    });
  }

  if (activeScreenState && activeScreenState.isStopped) {
    const dur = Math.max(0, finalizationMs - activeScreenState.stopTime);
    mediaStoppages.push({
      channel: 'SCREEN',
      startTime: activeScreenState.stopTime,
      endTime: finalizationMs,
      durationMs: dur,
      isRecovered: false,
      event: activeScreenState.stopEvent,
    });
  }

  // ─── EVALUATE MEDIA STOPPAGES ACCORDING TO MEDIA TIER PRECEDENCE ───
  mediaStoppages.forEach((stop, mIdx) => {
    // Check if attention divergence overlaps or co-occurs within 3000ms
    const hasAttention = consolidatedTokens.some((tok) => {
      if (tok.category !== CATEGORIES.ATTENTION) return false;
      const overlaps = Math.max(stop.startTime, tok.startTime) <= Math.min(stop.endTime, tok.endTime);
      const close = Math.abs(stop.startTime - tok.startTime) <= THRESHOLDS.CORRELATION_WINDOW_MS;
      return overlaps || close;
    });

    // Check if answers were recorded during stoppage
    const hasAnswers = answerTimesMs.some((ansT) => ansT >= stop.startTime && ansT <= stop.endTime);

    const { tier, weight, isTier2Stoppage } = evaluateMediaTier({
      durationMs: stop.durationMs,
      isRecovered: stop.isRecovered,
      hasAttentionDivergence: hasAttention,
      hasAnswersSubmitted: hasAnswers,
    });

    if (isTier2Stoppage) {
      tier2Count += 1;
    }

    consolidatedTokens.push({
      id: `token_media_${stop.channel.toLowerCase()}_${mIdx + 1}`,
      type: `${stop.channel}_STOPPED`,
      category: CATEGORIES.MEDIA,
      startTime: stop.startTime,
      endTime: stop.endTime,
      durationMs: stop.durationMs,
      occurrenceIndex: 1,
      isSuppressed: false,
      mediaTier: tier,
      mediaWeight: weight,
      isRecovered: stop.isRecovered,
      hasAttentionDivergence: hasAttention,
      hasAnswersSubmitted: hasAnswers,
    });
  });

  // Sort tokens chronologically by startTime
  consolidatedTokens.sort((a, b) => a.startTime - b.startTime);

  return {
    tokens: consolidatedTokens,
    mediaStoppages,
    tier2Count,
  };
}

/**
 * Stage 5: Episode Clustering
 * Section 2E:
 * Groups tokens into episodes if:
 * 1. Gap between consecutive tokens <= 3000ms
 * 2. Total cluster span <= 30000ms
 * Note: Intrinsic token duration is preserved and not truncated by the 30s cluster cap.
 *
 * @param {Array<Object>} tokens - Consolidated tokens from Stage 3/4
 * @returns {Array<Object>} Array of clustered Episode objects
 */
function clusterEpisodes(tokens = []) {
  if (!tokens || tokens.length === 0) return [];

  const episodes = [];
  let currentTokens = [tokens[0]];
  let clusterStartTime = tokens[0].startTime;

  for (let i = 1; i < tokens.length; i++) {
    const currentToken = tokens[i];
    const prevToken = tokens[i - 1];

    const gap = currentToken.startTime - prevToken.endTime;
    const prospectiveSpan = currentToken.startTime - clusterStartTime;

    if (gap <= THRESHOLDS.CORRELATION_WINDOW_MS && prospectiveSpan <= THRESHOLDS.CLUSTER_SPAN_CAP_MS) {
      currentTokens.push(currentToken);
    } else {
      // Close existing cluster
      episodes.push(createEpisodeFromTokens(currentTokens, episodes.length + 1));
      currentTokens = [currentToken];
      clusterStartTime = currentToken.startTime;
    }
  }

  if (currentTokens.length > 0) {
    episodes.push(createEpisodeFromTokens(currentTokens, episodes.length + 1));
  }

  return episodes;
}

/**
 * Helper to build an episode cluster object from grouped tokens
 */
function createEpisodeFromTokens(tokens, episodeIndex) {
  const startTime = Math.min(...tokens.map((t) => t.startTime));
  const endTime = Math.max(...tokens.map((t) => t.endTime));
  const distinctCategories = new Set(tokens.filter((t) => !t.isSuppressed).map((t) => t.category));

  return {
    id: `episode_${episodeIndex}`,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime - startTime),
    tokens,
    distinctCategories: Array.from(distinctCategories),
  };
}

// ============================================================================
// 4. STAGE 6: SCORING & INTEGRITY RISK ENGINE (R)
// ============================================================================

/**
 * Calculates session-wide integrity risk score (R) strictly according to Section 2H:
 * Step 1: Category Summation & Category Capping (CatRisk_c = min(Cap_c, sum R_event))
 * Step 2: Answer Context Adjustment (Delta R_ans = +8 if answer recorded during episode with V >= 2)
 * Step 3: Cross-Category Compounding (+15 if >= 2 distinct categories have CatRisk_c >= 10)
 * Step 4: Final Total Integrity Risk (R = min(100, sum CatRisk_c + Delta R_ans + Compounding))
 *
 * @param {Array<Object>} episodes
 * @param {Array<number>} answerTimesMs
 * @returns {Object} Detailed risk breakdown and total score R
 */
function calculateRiskScore(episodes = [], answerTimesMs = []) {
  // Accumulate raw un-capped points per category across all episodes
  const accumulatedCategoryRisk = {
    [CATEGORIES.ATTENTION]: 0,
    [CATEGORIES.CAMERA]: 0,
    [CATEGORIES.SCREEN]: 0,
    [CATEGORIES.MEDIA]: 0,
  };

  let hasCoincidentAnswerWithMultiVector = false;

  // Evaluate each episode cluster
  for (const ep of episodes) {
    // 1. Identify which categories have active non-zero points in this episode
    const episodeCategoryPoints = {
      [CATEGORIES.ATTENTION]: 0,
      [CATEGORIES.CAMERA]: 0,
      [CATEGORIES.SCREEN]: 0,
      [CATEGORIES.MEDIA]: 0,
    };

    // Calculate base points for each token in episode
    for (const tok of ep.tokens) {
      if (tok.isSuppressed) continue;

      let w0 = 0;
      let minFloorMs = 0;

      if (tok.category === CATEGORIES.MEDIA) {
        w0 = typeof tok.mediaWeight === 'number' ? tok.mediaWeight : 0;
      } else {
        const weightConfig = BASE_WEIGHTS[tok.type];
        if (weightConfig) {
          w0 = tok.occurrenceIndex === 1 ? weightConfig.first : weightConfig.repeat;
          minFloorMs = weightConfig.minDurationMs || 0;
        }
      }

      // Check minimum duration noise floor
      if (tok.durationMs < minFloorMs) {
        w0 = 0;
      }

      const muD = computeDurationMultiplier(tok.durationMs);
      const basePoints = w0 * muD;

      if (basePoints > 0) {
        episodeCategoryPoints[tok.category] += basePoints;
      }
    }

    // 2. Count distinct categories contributing positive risk (V)
    const activeCategories = Object.keys(episodeCategoryPoints).filter(
      (cat) => episodeCategoryPoints[cat] > 0
    );
    const vectorCount = activeCategories.length;
    const kappa = computeCorroborationMultiplier(vectorCount);

    // 3. Apply corroboration multiplier kappa(V)
    for (const cat of activeCategories) {
      const episodePoints = episodeCategoryPoints[cat] * kappa;
      accumulatedCategoryRisk[cat] += episodePoints;
    }

    // 4. Check for answer coincidence during episode with V >= 2
    if (vectorCount >= 2) {
      const coincidentAnswer = answerTimesMs.some(
        (ansT) => ansT >= ep.startTime && ansT <= ep.endTime
      );
      if (coincidentAnswer) {
        hasCoincidentAnswerWithMultiVector = true;
      }
    }
  }

  // Step 1: Apply category caps (20 / 35 / 35 / 35)
  const categoryRiskBreakdown = {
    attention: Math.min(CATEGORY_CAPS.ATTENTION, accumulatedCategoryRisk[CATEGORIES.ATTENTION]),
    camera: Math.min(CATEGORY_CAPS.CAMERA, accumulatedCategoryRisk[CATEGORIES.CAMERA]),
    screen: Math.min(CATEGORY_CAPS.SCREEN, accumulatedCategoryRisk[CATEGORIES.SCREEN]),
    media: Math.min(CATEGORY_CAPS.MEDIA, accumulatedCategoryRisk[CATEGORIES.MEDIA]),
  };

  // Step 2: Answer context adjustment (+8 pts)
  const deltaRans = hasCoincidentAnswerWithMultiVector ? THRESHOLDS.ANSWER_CONTEXT_PTS : 0;

  // Step 3: Cross-Category Compounding (+15 pts if >= 2 categories have CatRisk_c >= 10)
  const qualifyingCategoriesCount = Object.values(categoryRiskBreakdown).filter(
    (pts) => pts >= THRESHOLDS.COMPOUNDING_CATEGORY_QUALIFYING_PTS
  ).length;
  const compounding = qualifyingCategoriesCount >= 2 ? THRESHOLDS.COMPOUNDING_PTS : 0;

  // Step 4: Final Total Integrity Risk Score R in [0, 100]
  const sumCategories =
    categoryRiskBreakdown.attention +
    categoryRiskBreakdown.camera +
    categoryRiskBreakdown.screen +
    categoryRiskBreakdown.media;

  const totalRiskScore = Math.min(100, Math.round(sumCategories + deltaRans + compounding));

  return {
    integrityRiskScore: totalRiskScore,
    categoryRiskBreakdown,
    deltaRans,
    compounding,
    qualifyingCategoriesCount,
  };
}

// ============================================================================
// 5. EVIDENCE CONFIDENCE (C) & PRIOR CONFIDENCE (C_prior)
// ============================================================================

/**
 * Calculates Evidence Confidence score C strictly according to Section 2I:
 * C = 0.25 * Init_sensors + 0.30 * Cont_streams + 0.20 * Qual_cv + 0.15 * Cont_hb + 0.10 * Obs_incident
 *
 * @param {Object} metrics
 * @param {number} metrics.initSensors - in {0.0, 0.5, 1.0}
 * @param {number} metrics.continuityCamera - in [0.0, 1.0]
 * @param {number} metrics.continuityScreen - in [0.0, 1.0]
 * @param {number} metrics.continuityStreams - in [0.0, 1.0]
 * @param {number} metrics.qualityCv - in [0.0, 1.0]
 * @param {number} metrics.continuityHeartbeats - in [0.0, 1.0]
 * @param {number} metrics.observabilityIncident - in [0.0, 1.0]
 * @returns {number} Confidence C in [0.0, 1.0]
 */
function calculateConfidence({
  initSensors = 1.0,
  continuityStreams = null,
  continuityCamera = 1.0,
  continuityScreen = 1.0,
  qualityCv = 1.0,
  continuityHeartbeats = 1.0,
  observabilityIncident = 1.0,
}) {
  const init = Math.max(0.0, Math.min(1.0, Number(initSensors) || 0.0));
  const contCam = Math.max(0.0, Math.min(1.0, Number(continuityCamera) || 0.0));
  const contScreen = Math.max(0.0, Math.min(1.0, Number(continuityScreen) || 0.0));
  const contStreams =
    continuityStreams !== null && continuityStreams !== undefined
      ? Math.max(0.0, Math.min(1.0, Number(continuityStreams)))
      : (contCam + contScreen) / 2.0;

  const qualCv = Math.max(0.0, Math.min(1.0, Number(qualityCv) || 0.0));
  const contHb = Math.max(0.0, Math.min(1.0, Number(continuityHeartbeats) || 0.0));
  const obs = Math.max(0.0, Math.min(1.0, Number(observabilityIncident) || 0.0));

  const c = 0.25 * init + 0.30 * contStreams + 0.20 * qualCv + 0.15 * contHb + 0.10 * obs;
  return Number(Math.max(0.0, Math.min(1.0, c)).toFixed(4));
}

/**
 * Calculates Prior Confidence C_prior over pre-incident window [T_started, t_start]
 * Section 2J of Frozen Spec:
 * C_prior = 0.25 * Init + 0.30 * Cont_streams(t_start) + 0.20 * Qual_cv(t_start) + 0.15 * Cont_hb(t_start) + 0.10 * 1.0
 *
 * @param {number} incidentStartTimeMs
 * @param {Object} context
 * @returns {number} C_prior in [0.0, 1.0]
 */
function calculatePriorConfidence(incidentStartTimeMs, context = {}) {
  const startedAtMs = context.startedAt ? new Date(context.startedAt).getTime() : 0;
  const elapsedPreIncident = incidentStartTimeMs - startedAtMs;

  // Cold Start check (< 60s): evaluated against pre-exam setup verification
  if (elapsedPreIncident < 60000) {
    const setupHealthy = context.initSensors === 1.0 && !context.setupFailed;
    return setupHealthy ? 0.95 : 0.50;
  }

  return calculateConfidence({
    initSensors: context.initSensors !== undefined ? context.initSensors : 1.0,
    continuityCamera: context.priorCamCont !== undefined ? context.priorCamCont : 1.0,
    continuityScreen: context.priorScreenCont !== undefined ? context.priorScreenCont : 1.0,
    qualityCv: context.priorQualCv !== undefined ? context.priorQualCv : 1.0,
    continuityHeartbeats: context.priorContHb !== undefined ? context.priorContHb : 1.0,
    observabilityIncident: 1.0,
  });
}

// ============================================================================
// 6. TECHNICAL HEALTH (H) & HARD VIOLATION (HV)
// ============================================================================

/**
 * Technical Health Predicate H
 * Section 2K:
 * H = SUFFICIENT iff:
 *   Init_sensors == 1.0
 *   AND Cont_cam >= 0.70
 *   AND Cont_screen >= 0.70
 *   AND Cont_hb >= 0.70
 *   AND N_tier2_failures == 0
 * Otherwise INSUFFICIENT.
 *
 * @param {Object} params
 * @returns {string} SUFFICIENT or INSUFFICIENT
 */
function calculateTechnicalHealth({
  initSensors = 1.0,
  continuityCamera = 1.0,
  continuityScreen = 1.0,
  continuityHeartbeats = 1.0,
  tier2StopsCount = 0,
}) {
  const initOk = initSensors === 1.0;
  const camOk = continuityCamera >= THRESHOLDS.HEALTH_CONTINUITY_BOUNDARY;
  const scrOk = continuityScreen >= THRESHOLDS.HEALTH_CONTINUITY_BOUNDARY;
  const hbOk = continuityHeartbeats >= THRESHOLDS.HEALTH_CONTINUITY_BOUNDARY;
  const noTier2 = tier2StopsCount === 0;

  if (initOk && camOk && scrOk && hbOk && noTier2) {
    return TECHNICAL_HEALTH.SUFFICIENT;
  }
  return TECHNICAL_HEALTH.INSUFFICIENT;
}

/**
 * Hard Violation Predicate HV
 * Section 2L:
 * HV = TRUE iff:
 *   (t_unrecovered_blackout > 60s)
 *   AND (Attention Diverted)
 *   AND (N_answers_during_blackout >= 1)
 *   AND (C_prior >= 0.75)
 * Otherwise FALSE.
 *
 * @param {Object} params
 * @returns {boolean}
 */
function evaluateHardViolation({
  mediaStoppages = [],
  tokens = [],
  answerTimesMs = [],
  context = {},
}) {
  for (const stop of mediaStoppages) {
    if (stop.durationMs > THRESHOLDS.HARD_VIOLATION_BLACKOUT_MS) {
      // Check attention diverted during this blackout
      const attentionDiverted = tokens.some((tok) => {
        if (tok.category !== CATEGORIES.ATTENTION) return false;
        const overlaps = Math.max(stop.startTime, tok.startTime) <= Math.min(stop.endTime, tok.endTime);
        const close = Math.abs(stop.startTime - tok.startTime) <= THRESHOLDS.CORRELATION_WINDOW_MS;
        return overlaps || close;
      });

      // Check answers submitted during blackout
      const answersRecorded = answerTimesMs.filter(
        (ansT) => ansT >= stop.startTime && ansT <= stop.endTime
      ).length;

      // Check C_prior immediately before stoppage began
      const cPrior = calculatePriorConfidence(stop.startTime, context);

      if (attentionDiverted && answersRecorded >= 1 && cPrior >= THRESHOLDS.CONFIDENCE_PRIOR_BOUNDARY) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// 7. DETERMINISTIC DECISION TREE
// ============================================================================

/**
 * Deterministic Decision Tree Hierarchy
 * Section 3:
 * Rule 1: If HV == TRUE => VOID (Hard Compound Violation)
 * Rule 2: If R >= 50 AND C >= 0.75 => VOID (Severe Corroborated Integrity Risk)
 * Rule 3: If (H == INSUFFICIENT OR C < 0.75) AND R < 50 => TECHNICAL (Technical Failure Protection)
 * Rule 4: If H == SUFFICIENT AND C >= 0.75 AND R < 50 => RELEASE (Autonomous Release)
 *         - Sub-classification: Clean (R < 25) vs Advisory (25 <= R < 50)
 * Rule 5: Otherwise => TECHNICAL (Fail-Safe Default)
 *
 * @param {Object} params
 * @param {number} params.R - Integrity Risk Score [0, 100]
 * @param {number} params.C - Evidence Confidence [0.0, 1.0]
 * @param {string} params.H - SUFFICIENT or INSUFFICIENT
 * @param {boolean} params.HV - Hard Violation Triggered
 * @returns {{ decision: string, advisoryClearance: boolean, reasonCodes: Array<string> }}
 */
function evaluateDecisionHierarchy({ R, C, H, HV }) {
  const reasonCodes = [];

  // Rule 1: Hard Compound Violation (Takes absolute precedence)
  if (HV === true) {
    reasonCodes.push(REASON_CODES.HARD_VIOLATION_CONFIRMED);
    return {
      decision: DECISIONS.VOID,
      advisoryClearance: false,
      reasonCodes,
    };
  }

  // Rule 2: Severe Corroborated Integrity Risk
  if (R >= THRESHOLDS.RISK_RELEASE_MAX && C >= THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY) {
    reasonCodes.push(REASON_CODES.HIGH_RISK_HIGH_CONFIDENCE);
    reasonCodes.push(REASON_CODES.CORROBORATED_MULTI_VECTOR_BREACH);
    return {
      decision: DECISIONS.VOID,
      advisoryClearance: false,
      reasonCodes,
    };
  }

  // Rule 3: Technical Failure Protection
  if ((H === TECHNICAL_HEALTH.INSUFFICIENT || C < THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY) && R < THRESHOLDS.RISK_RELEASE_MAX) {
    if (H === TECHNICAL_HEALTH.INSUFFICIENT) {
      reasonCodes.push(REASON_CODES.TECHNICAL_DEGRADATION);
    }
    if (C < THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY) {
      reasonCodes.push(REASON_CODES.INSUFFICIENT_CONFIDENCE);
    }
    return {
      decision: DECISIONS.TECHNICAL,
      advisoryClearance: false,
      reasonCodes,
    };
  }

  // Rule 4: Autonomous Release (Clean vs Advisory)
  if (H === TECHNICAL_HEALTH.SUFFICIENT && C >= THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY && R < THRESHOLDS.RISK_RELEASE_MAX) {
    const isAdvisory = R >= THRESHOLDS.RISK_ADVISORY_MIN;
    if (isAdvisory) {
      reasonCodes.push(REASON_CODES.ADVISORY_ANOMALIES_RECORDED);
    } else {
      reasonCodes.push(REASON_CODES.CLEAN_SUBMISSION);
    }
    return {
      decision: DECISIONS.RELEASE,
      advisoryClearance: isAdvisory,
      reasonCodes,
    };
  }

  // Rule 5: Fail-Safe Default (e.g. R >= 50 but C < 0.75 or degraded telemetry)
  if (C < THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY) {
    reasonCodes.push(REASON_CODES.INSUFFICIENT_CONFIDENCE);
  }
  if (H === TECHNICAL_HEALTH.INSUFFICIENT) {
    reasonCodes.push(REASON_CODES.TECHNICAL_DEGRADATION);
  }
  reasonCodes.push(REASON_CODES.FAIL_SAFE_TECHNICAL_HOLD);
  return {
    decision: DECISIONS.TECHNICAL,
    advisoryClearance: false,
    reasonCodes,
  };
}

// ============================================================================
// 8. MASTER ORCHESTRATION SERVICE
// ============================================================================

/**
 * Master Adjudication Orchestrator
 * Fully adjudicates a proctoring session, producing the typed adjudication subdocument
 * for ProctoringAssessment.
 *
 * @param {Object} params
 * @param {Array<Object>} params.events - Raw ProctoringEvent documents/objects
 * @param {Array<Object>} [params.episodes] - Optional pre-correlated episodes
 * @param {Object} [params.mockTestSession] - MockTestSession document/object
 * @param {Object} [params.proctoringSession] - ProctoringSession document/object
 * @param {Object} [params.mockTest] - MockTest document/object
 * @param {Object} [params.options] - Execution options and metric overrides
 * @returns {Object} Typed adjudication payload
 */
function adjudicateProctoring({
  events = [],
  episodes = [],
  mockTestSession = null,
  proctoringSession = null,
  mockTest = null,
  options = {},
}) {
  const startedAt =
    (mockTestSession && mockTestSession.startedAt) ||
    (proctoringSession && proctoringSession.startedAt) ||
    (events[0] && (events[0].timestamp || events[0].createdAt)) ||
    new Date();

  const finalizationAt =
    (mockTestSession && (mockTestSession.submittedAt || mockTestSession.expiresAt)) ||
    (proctoringSession && proctoringSession.endedAt) ||
    new Date();

  const testWindow = {
    startedAt,
    finalizationAt,
  };

  // 1. Resolve submitted answer timestamps
  const answers = (mockTestSession && Array.isArray(mockTestSession.answers) && mockTestSession.answers) || [];
  const answerTimesMs = answers
    .map((a) => (a.answeredAt ? new Date(a.answeredAt).getTime() : null))
    .filter((t) => typeof t === 'number' && !Number.isNaN(t));

  // 2. Stage 1 & 2: Ingestion & Deterministic Sequence Sort
  const sortedEvents = normalizeEvents(events, testWindow);

  // 3. Stage 3 & 4: Semantic Reconstruction & State Machine Normalization
  const fsmResult = reconstructSemanticFSM(sortedEvents, testWindow, answerTimesMs);

  // 4. Stage 5: Episode Clustering
  const clusteredEpisodes = clusterEpisodes(fsmResult.tokens);

  // 5. Stage 6: Integrity Risk Calculation (R)
  const riskResult = calculateRiskScore(clusteredEpisodes, answerTimesMs);

  // 6. Compute Telemetry & Continuity Metrics
  const activeExamDurationMs = Math.max(1000, new Date(finalizationAt).getTime() - new Date(startedAt).getTime());

  // Determine initial setup states
  let initSensors = 1.0;
  if (proctoringSession) {
    const camDenied = proctoringSession.cameraState === 'denied' || proctoringSession.cameraState === 'unsupported';
    const scrDenied = proctoringSession.screenShareState === 'denied' || proctoringSession.screenShareState === 'unsupported';
    if (camDenied && scrDenied) {
      initSensors = 0.0;
    } else if (camDenied || scrDenied) {
      initSensors = 0.5;
    }
  }
  if (options.initSensors !== undefined) {
    initSensors = options.initSensors;
  }

  // Calculate stream continuity
  let cameraDownMs = 0;
  let screenDownMs = 0;
  fsmResult.mediaStoppages.forEach((stop) => {
    if (stop.channel === 'CAMERA') cameraDownMs += stop.durationMs;
    if (stop.channel === 'SCREEN') screenDownMs += stop.durationMs;
  });

  const continuityCamera =
    options.continuityCamera !== undefined
      ? options.continuityCamera
      : Math.max(0.0, Math.min(1.0, 1.0 - cameraDownMs / activeExamDurationMs));

  const continuityScreen =
    options.continuityScreen !== undefined
      ? options.continuityScreen
      : Math.max(0.0, Math.min(1.0, 1.0 - screenDownMs / activeExamDurationMs));

  const continuityStreams =
    options.continuityStreams !== undefined
      ? options.continuityStreams
      : (continuityCamera + continuityScreen) / 2.0;

  const qualityCv =
    options.qualityCv !== undefined
      ? options.qualityCv
      : proctoringSession && proctoringSession.metadata && typeof proctoringSession.metadata.qualityCv === 'number'
      ? proctoringSession.metadata.qualityCv
      : continuityCamera >= 0.70
      ? 1.0
      : continuityCamera;

  const continuityHeartbeats =
    options.continuityHeartbeats !== undefined
      ? options.continuityHeartbeats
      : proctoringSession && proctoringSession.metadata && typeof proctoringSession.metadata.continuityHeartbeats === 'number'
      ? proctoringSession.metadata.continuityHeartbeats
      : 1.0;

  const observabilityIncident =
    options.observabilityIncident !== undefined
      ? options.observabilityIncident
      : fsmResult.mediaStoppages.some((m) => m.durationMs > 10000)
      ? 0.0
      : 1.0;

  // 7. Calculate Confidence (C)
  const confidenceScore = calculateConfidence({
    initSensors,
    continuityStreams,
    continuityCamera,
    continuityScreen,
    qualityCv,
    continuityHeartbeats,
    observabilityIncident,
  });

  // 8. Calculate Technical Health (H)
  const technicalHealth = calculateTechnicalHealth({
    initSensors,
    continuityCamera,
    continuityScreen,
    continuityHeartbeats,
    tier2StopsCount: fsmResult.tier2Count,
  });

  // 9. Evaluate Hard Violation (HV)
  const hardViolation =
    options.hardViolation !== undefined
      ? Boolean(options.hardViolation)
      : evaluateHardViolation({
          mediaStoppages: fsmResult.mediaStoppages,
          tokens: fsmResult.tokens,
          answerTimesMs,
          context: {
            startedAt,
            initSensors,
            priorCamCont: continuityCamera,
            priorScreenCont: continuityScreen,
            priorQualCv: qualityCv,
            priorContHb: continuityHeartbeats,
          },
        });

  // 10. Evaluate Deterministic Decision Tree
  const decisionResult = evaluateDecisionHierarchy({
    R: riskResult.integrityRiskScore,
    C: confidenceScore,
    H: technicalHealth,
    HV: hardViolation,
  });

  return {
    adjudicationModelVersion: ADJUDICATION_MODEL_VERSION,
    decision: decisionResult.decision,
    decisionSource: 'AUTOMATED',
    integrityRiskScore: riskResult.integrityRiskScore,
    evidenceConfidence: confidenceScore,
    technicalHealth,
    hardViolationTriggered: hardViolation,
    advisoryClearance: decisionResult.advisoryClearance,
    reasonCodes: decisionResult.reasonCodes,
    categoryRiskBreakdown: riskResult.categoryRiskBreakdown,
    metrics: {
      initSensors,
      continuityStreams,
      continuityCamera,
      continuityScreen,
      continuityHeartbeats,
      qualityCv,
      observabilityIncident,
    },
    adjudicatedAt: new Date(),
  };
}

/**
 * Development & calibration replay function.
 * Pure analysis: Evaluates historical telemetry without persisting or mutating production records.
 *
 * @param {Object} params
 * @returns {Object} Replay adjudication analysis
 */
function replayAdjudication(params = {}) {
  const result = adjudicateProctoring(params);
  return {
    replayed: true,
    adjudicationModelVersion: ADJUDICATION_MODEL_VERSION,
    integrityRiskScore: result.integrityRiskScore,
    evidenceConfidence: result.evidenceConfidence,
    technicalHealth: result.technicalHealth,
    hardViolationTriggered: result.hardViolationTriggered,
    decision: result.decision,
    advisoryClearance: result.advisoryClearance,
    reasonCodes: result.reasonCodes,
    categoryRiskBreakdown: result.categoryRiskBreakdown,
    metrics: result.metrics,
    replayedAt: new Date(),
  };
}

module.exports = {
  ADJUDICATION_MODEL_VERSION,
  CATEGORIES,
  CATEGORY_CAPS,
  DECISIONS,
  TECHNICAL_HEALTH,
  REASON_CODES,
  BASE_WEIGHTS,
  THRESHOLDS,
  computeDurationMultiplier,
  computeCorroborationMultiplier,
  evaluateMediaTier,
  normalizeEvents,
  reconstructSemanticFSM,
  clusterEpisodes,
  calculateRiskScore,
  calculateConfidence,
  calculatePriorConfidence,
  calculateTechnicalHealth,
  evaluateHardViolation,
  evaluateDecisionHierarchy,
  adjudicateProctoring,
  replayAdjudication,
};
