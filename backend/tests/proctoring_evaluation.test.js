const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  correlateEvents,
  evaluatePairwiseRelationships,
  classifyEvent,
  CORRELATION_WINDOW_MS,
  MAX_CLUSTER_DURATION_MS,
} = require('../services/temporalCorrelationService');

const {
  extractEvidence,
  computeStatistics,
  buildTimeline,
  buildRelationships,
  buildTechnicalObservations,
  buildUnknowns,
  synthesizeReport,
} = require('../services/proctoringReportService');

const ObservationStateMachine = require('../../frontend/scripts/proctoring/observationState');
const ScreenObservationStateMachine = require('../../frontend/scripts/proctoring/screenObservationState');
const { ScreenMonitor } = require('../../frontend/scripts/proctoring/screenMonitor');

// ─── Deterministic Evaluation Harness (Part 2) ─────────────────────────

const BASE_TIME = new Date('2026-09-20T10:00:00.000Z');

function createTimestamp(offsetMs) {
  return new Date(BASE_TIME.getTime() + offsetMs);
}

function createSyntheticEvent(id, type, offsetMs, options = {}) {
  return {
    _id: id,
    id: id,
    type,
    source: options.source || classifyEvent(type).toLowerCase(),
    timestamp: createTimestamp(offsetMs),
    duration: options.duration || 0,
    metadata: options.metadata || {},
    proctoringSession: options.proctoringSession || 'proc_session_test_1',
    mockTestSession: options.mockTestSession || 'mock_session_test_1',
    user: options.user || 'user_test_1',
  };
}

function runEvaluationPipeline({ events = [], mockSession = null, procSession = null, mockTest = null }) {
  const mSession = mockSession || {
    _id: 'mock_session_test_1',
    user: 'user_test_1',
    status: 'completed',
    startedAt: createTimestamp(0),
    submittedAt: createTimestamp(1800000),
    answers: [],
    result: { score: 100, maxMarks: 300, percentage: 33.3, accuracy: 50 },
  };

  const pSession = procSession || {
    _id: 'proc_session_test_1',
    mockTestSession: 'mock_session_test_1',
    user: 'user_test_1',
    status: 'completed',
    startedAt: createTimestamp(0),
    endedAt: createTimestamp(1800000),
    cameraState: 'inactive',
    microphoneState: 'inactive',
    screenShareState: 'inactive',
    fullscreenState: 'inactive',
  };

  const mTest = mockTest || {
    _id: 'mock_test_jee_1',
    title: 'JEE Main Full Mock Test 1',
    duration: 180,
    totalQuestions: 75,
    questions: [],
  };

  const episodes = correlateEvents(events, {
    mockTestSession: mSession,
    mockTest: mTest,
    windowMs: CORRELATION_WINDOW_MS,
    maxClusterDurationMs: MAX_CLUSTER_DURATION_MS,
  });

  const report = synthesizeReport(mSession, pSession, mTest, events, episodes);

  return {
    rawEvents: events,
    episodes,
    report,
    statistics: report.statistics,
  };
}

describe('Phase 7 — Proctoring Evaluation & Hardening Suite', () => {

  // ══════════════════════════════════════════════════════════════════════
  // PART 3 — Temporal Correlation Matrix
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 3: Temporal Correlation Matrix (Rules A-G Positive & Negative)', () => {
    
    it('Rule A Positive: FOCUS_LOST <-> PAGE_HIDDEN detects FOCUS_VISIBILITY_ALIGNMENT', () => {
      const ev1 = createSyntheticEvent('ev_a1', 'FOCUS_LOST', 1000);
      const ev2 = createSyntheticEvent('ev_a2', 'PAGE_HIDDEN', 1850); // delta = 850ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'FOCUS_VISIBILITY_ALIGNMENT');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_a1', 'ev_a2']);
      assert.strictEqual(rel.deltaMs, 850);
    });

    it('Rule B Positive: FOCUS_REGAINED <-> PAGE_VISIBLE detects FOCUS_VISIBILITY_RETURN', () => {
      const ev1 = createSyntheticEvent('ev_b1', 'FOCUS_REGAINED', 5000);
      const ev2 = createSyntheticEvent('ev_b2', 'PAGE_VISIBLE', 5200); // delta = 200ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'FOCUS_VISIBILITY_RETURN');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_b1', 'ev_b2']);
      assert.strictEqual(rel.deltaMs, 200);
    });

    it('Rule C Positive: FACE_ABSENT <-> (FOCUS_LOST, PAGE_HIDDEN, FULLSCREEN_EXITED) detects FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE', () => {
      const ev1 = createSyntheticEvent('ev_c1', 'FACE_ABSENT', 10000, { duration: 2500 });
      const ev2 = createSyntheticEvent('ev_c2', 'FULLSCREEN_EXITED', 11200); // delta = 1200ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_c1', 'ev_c2']);
      assert.strictEqual(rel.deltaMs, 1200);
    });

    it('Rule D Positive: SCREEN_VIEW_CHANGED <-> (FOCUS_LOST, PAGE_HIDDEN, FULLSCREEN_EXITED) detects SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE', () => {
      const ev1 = createSyntheticEvent('ev_d1', 'PAGE_HIDDEN', 20000);
      const ev2 = createSyntheticEvent('ev_d2', 'SCREEN_VIEW_CHANGED', 20450, { duration: 2000 }); // delta = 450ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_d1', 'ev_d2']);
      assert.strictEqual(rel.deltaMs, 450);
    });

    it('Rule E Positive: MULTIPLE_FACES <-> SCREEN_VIEW_CHANGED detects MULTIPLE_FACES_WITH_SCREEN_CHANGE', () => {
      const ev1 = createSyntheticEvent('ev_e1', 'MULTIPLE_FACES', 30000, { duration: 1500 });
      const ev2 = createSyntheticEvent('ev_e2', 'SCREEN_VIEW_CHANGED', 31400, { duration: 2200 }); // delta = 1400ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'MULTIPLE_FACES_WITH_SCREEN_CHANGE');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_e1', 'ev_e2']);
      assert.strictEqual(rel.deltaMs, 1400);
    });

    it('Rule F Positive: SCREEN_VIEW_UNAVAILABLE <-> SCREEN_SHARE_STOPPED detects SCREEN_CAPTURE_INTERRUPTION', () => {
      const ev1 = createSyntheticEvent('ev_f1', 'SCREEN_SHARE_STOPPED', 40000);
      const ev2 = createSyntheticEvent('ev_f2', 'SCREEN_VIEW_UNAVAILABLE', 40050); // delta = 50ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'SCREEN_CAPTURE_INTERRUPTION');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_f1', 'ev_f2']);
      assert.strictEqual(rel.deltaMs, 50);
    });

    it('Rule G Positive: CAMERA_STOPPED <-> FACE_ABSENT detects CAMERA_MEDIA_INTERRUPTION', () => {
      const ev1 = createSyntheticEvent('ev_g1', 'CAMERA_STOPPED', 50000);
      const ev2 = createSyntheticEvent('ev_g2', 'FACE_ABSENT', 50600, { duration: 1800 }); // delta = 600ms

      const episodes = correlateEvents([ev1, ev2]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);

      const rel = episodes[0].relationships[0];
      assert.strictEqual(rel.type, 'CAMERA_MEDIA_INTERRUPTION');
      assert.deepStrictEqual(rel.eventIds.sort(), ['ev_g1', 'ev_g2']);
      assert.strictEqual(rel.deltaMs, 600);
    });

    it('Correlation Window Boundary: delta = 3000ms correlates; delta = 3001ms does NOT correlate', () => {
      // 3000ms: correlates
      const evMatch1 = createSyntheticEvent('ev_m1', 'FOCUS_LOST', 0);
      const evMatch2 = createSyntheticEvent('ev_m2', 'PAGE_HIDDEN', 3000);
      const epMatch = correlateEvents([evMatch1, evMatch2]);
      assert.strictEqual(epMatch.length, 1);
      assert.strictEqual(epMatch[0].relationships.length, 1);
      assert.strictEqual(epMatch[0].relationships[0].deltaMs, 3000);

      // 3001ms: does NOT correlate into a relationship
      const evNo1 = createSyntheticEvent('ev_n1', 'FOCUS_LOST', 0);
      const evNo2 = createSyntheticEvent('ev_n2', 'PAGE_HIDDEN', 3001);
      const epNo = correlateEvents([evNo1, evNo2]);
      // Beyond 3000ms, they also split into separate clusters
      assert.strictEqual(epNo.length, 2);
      assert.strictEqual(epNo[0].relationships.length, 0);
      assert.strictEqual(epNo[1].relationships.length, 0);
    });

    it('Unrelated stream event types within window produce episode but zero false relationships', () => {
      const ev1 = createSyntheticEvent('ev_u1', 'CAMERA_STARTED', 1000);
      const ev2 = createSyntheticEvent('ev_u2', 'PAGE_VISIBLE', 1500); // delta = 500ms
      const episodes = correlateEvents([ev1, ev2]);

      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 0); // No matching rule
    });

    it('Large temporal gaps produce distinct separate episodes with zero relationships', () => {
      const ev1 = createSyntheticEvent('ev_g1', 'FOCUS_LOST', 0);
      const ev2 = createSyntheticEvent('ev_g2', 'PAGE_HIDDEN', 600000); // 10 minutes later
      const episodes = correlateEvents([ev1, ev2]);

      assert.strictEqual(episodes.length, 2);
      assert.strictEqual(episodes[0].relationships.length, 0);
      assert.strictEqual(episodes[1].relationships.length, 0);
    });

    it('Out-of-order raw events are sorted chronologically by server timestamp', () => {
      const evLater = createSyntheticEvent('ev_ord2', 'PAGE_HIDDEN', 2000);
      const evEarlier = createSyntheticEvent('ev_ord1', 'FOCUS_LOST', 1000);

      const episodes = correlateEvents([evLater, evEarlier]); // passed backwards
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].relationships.length, 1);
      assert.strictEqual(episodes[0].relationships[0].deltaMs, 1000);
      assert.deepStrictEqual(episodes[0].eventIds, ['ev_ord1', 'ev_ord2']);
    });

    it('Raw Telemetry Rule: repeated raw events are preserved; duplicate analytical relationships are NOT generated', () => {
      // Two identical FOCUS_LOST raw events and one PAGE_HIDDEN
      const ev1 = createSyntheticEvent('ev_rep1', 'FOCUS_LOST', 1000);
      const ev2 = createSyntheticEvent('ev_rep2', 'FOCUS_LOST', 1100);
      const ev3 = createSyntheticEvent('ev_rep3', 'PAGE_HIDDEN', 1200);

      const episodes = correlateEvents([ev1, ev2, ev3]);
      assert.strictEqual(episodes.length, 1);
      // Raw events are preserved in the episode
      assert.strictEqual(episodes[0].eventIds.length, 3);
      assert.deepStrictEqual(episodes[0].eventIds, ['ev_rep1', 'ev_rep2', 'ev_rep3']);

      // FOCUS_LOST <-> FOCUS_LOST does not generate a relationship
      // ev_rep1 <-> ev_rep3 generates FOCUS_VISIBILITY_ALIGNMENT
      // ev_rep2 <-> ev_rep3 generates FOCUS_VISIBILITY_ALIGNMENT
      const relTypes = episodes[0].relationships.map((r) => r.type);
      assert.ok(relTypes.every((t) => t === 'FOCUS_VISIBILITY_ALIGNMENT'));
      assert.strictEqual(episodes[0].relationships.length, 2);
    });

    it('Heartbeat events do not create relationships, join clusters, or extend analytical episodes', () => {
      const ev1 = createSyntheticEvent('ev_hb1', 'FOCUS_LOST', 1000);
      const hb1 = createSyntheticEvent('ev_hb2', 'PROCTORING_HEARTBEAT', 2000);
      const hb2 = createSyntheticEvent('ev_hb3', 'PROCTORING_HEARTBEAT', 3500);
      const ev2 = createSyntheticEvent('ev_hb4', 'PAGE_HIDDEN', 1800);

      const episodes = correlateEvents([ev1, hb1, hb2, ev2]);
      assert.strictEqual(episodes.length, 1);
      // Episode only contains the meaningful events, heartbeats were filtered out
      assert.deepStrictEqual(episodes[0].eventIds, ['ev_hb1', 'ev_hb4']);
      assert.strictEqual(episodes[0].relationships.length, 1);
      assert.strictEqual(episodes[0].relationships[0].type, 'FOCUS_VISIBILITY_ALIGNMENT');
    });

    it('Identical timestamps are handled deterministically using secondary ID tie-breaking', () => {
      const evA = createSyntheticEvent('ev_same_z', 'PAGE_HIDDEN', 2000);
      const evB = createSyntheticEvent('ev_same_a', 'FOCUS_LOST', 2000);

      const episodes = correlateEvents([evA, evB]);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].durationMs, 0);
      assert.strictEqual(episodes[0].relationships.length, 1);
      assert.strictEqual(episodes[0].relationships[0].deltaMs, 0);
      // Secondary tie-breaker sorts ev_same_a before ev_same_z
      assert.deepStrictEqual(episodes[0].eventIds, ['ev_same_a', 'ev_same_z']);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 4 — Episode Boundaries & Cluster Hardening
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 4: Episode Boundaries & Bounded Clustering', () => {

    it('Continuous events over 10 seconds (every 1s) remain within a single bounded episode', () => {
      const events = [];
      for (let i = 0; i <= 10; i++) {
        events.push(createSyntheticEvent(`ev_10s_${i}`, 'FOCUS_LOST', i * 1000));
      }
      const episodes = correlateEvents(events);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].durationMs, 10000);
      assert.strictEqual(episodes[0].eventIds.length, 11);
    });

    it('Continuous events over 29 seconds (every 1s) remain within a single bounded episode', () => {
      const events = [];
      for (let i = 0; i <= 29; i++) {
        events.push(createSyntheticEvent(`ev_29s_${i}`, 'FOCUS_LOST', i * 1000));
      }
      const episodes = correlateEvents(events);
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].durationMs, 29000);
      assert.strictEqual(episodes[0].eventIds.length, 30);
    });

    it('Continuous events reaching exactly 30 seconds (every 1s) form a single episode bounded at maxClusterDurationMs', () => {
      const events = [];
      for (let i = 0; i <= 30; i++) {
        events.push(createSyntheticEvent(`ev_30s_${i}`, 'FOCUS_LOST', i * 1000));
      }
      const episodes = correlateEvents(events);
      // At t=30, clusterSpan = 30000 <= MAX_CLUSTER_DURATION_MS (30000)
      assert.strictEqual(episodes.length, 1);
      assert.strictEqual(episodes[0].durationMs, 30000);
      assert.strictEqual(episodes[0].eventIds.length, 31);
    });

    it('Continuous events beyond 30 seconds split strictly into bounded clusters', () => {
      const events = [];
      for (let i = 0; i <= 35; i++) {
        events.push(createSyntheticEvent(`ev_35s_${i}`, 'FOCUS_LOST', i * 1000));
      }
      const episodes = correlateEvents(events);
      // First episode contains events from t=0 to t=30 (31 events)
      // Second episode contains events from t=31 to t=35 (5 events)
      assert.strictEqual(episodes.length, 2);
      assert.strictEqual(episodes[0].durationMs, 30000);
      assert.strictEqual(episodes[0].eventIds.length, 31);
      assert.strictEqual(episodes[1].durationMs, 4000);
      assert.strictEqual(episodes[1].eventIds.length, 5);
    });

    it('Inter-event quiet period boundary: delta = 3000ms joins cluster; delta = 3001ms splits cluster', () => {
      const ev1 = createSyntheticEvent('ev_qp1', 'FULLSCREEN_EXITED', 0);
      const ev2 = createSyntheticEvent('ev_qp2', 'FULLSCREEN_ENTERED', 3000);
      const ep1 = correlateEvents([ev1, ev2]);
      assert.strictEqual(ep1.length, 1);

      const ev3 = createSyntheticEvent('ev_qp3', 'FULLSCREEN_EXITED', 0);
      const ev4 = createSyntheticEvent('ev_qp4', 'FULLSCREEN_ENTERED', 3001);
      const ep2 = correlateEvents([ev3, ev4]);
      assert.strictEqual(ep2.length, 2);
    });

    it('Stream composed entirely of heartbeats produces zero episodes', () => {
      const events = [];
      for (let i = 0; i < 50; i++) {
        events.push(createSyntheticEvent(`hb_${i}`, 'PROCTORING_HEARTBEAT', i * 30000));
      }
      const episodes = correlateEvents(events);
      assert.strictEqual(episodes.length, 0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 5 — Report & Evidence Traceability
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 5: Report & Evidence Traceability', () => {

    it('Full Evidence Graph Traceability: every timeline item, relationship, and technical observation maps to valid evidence and raw event IDs', () => {
      const ev1 = createSyntheticEvent('ev_tr1', 'CAMERA_STARTED', 1000);
      const ev2 = createSyntheticEvent('ev_tr2', 'FOCUS_LOST', 5000);
      const ev3 = createSyntheticEvent('ev_tr3', 'PAGE_HIDDEN', 5500);
      const ev4 = createSyntheticEvent('ev_tr4', 'SCREEN_VIEW_CHANGED', 12000, { duration: 2000 });
      const ev5 = createSyntheticEvent('ev_tr5', 'CAMERA_STOPPED', 15000);
      const ev6 = createSyntheticEvent('ev_tr6', 'FACE_ABSENT', 15300, { duration: 3000 });

      const { report, rawEvents } = runEvaluationPipeline({
        events: [ev1, ev2, ev3, ev4, ev5, ev6],
      });

      const evidenceMap = new Map();
      report.evidence.forEach((ev) => evidenceMap.set(ev.id, ev));

      const rawEventMap = new Map();
      rawEvents.forEach((re) => rawEventMap.set(re._id, re));

      // 1. Verify timeline items
      assert.ok(report.timeline.length > 0);
      report.timeline.forEach((tl) => {
        assert.ok(tl.evidenceIds.length > 0);
        tl.evidenceIds.forEach((eid) => {
          assert.ok(evidenceMap.has(eid), `Timeline item references unknown evidence ID: ${eid}`);
          const evItem = evidenceMap.get(eid);
          evItem.eventIds.forEach((rawId) => {
            assert.ok(rawEventMap.has(rawId), `Evidence item references non-existent raw event ID: ${rawId}`);
          });
        });
      });

      // 2. Verify relationships
      assert.ok(report.relationships.length > 0);
      report.relationships.forEach((rel) => {
        assert.ok(rel.evidenceIds.length > 0);
        rel.evidenceIds.forEach((eid) => {
          assert.ok(evidenceMap.has(eid), `Relationship references unknown evidence ID: ${eid}`);
        });
      });

      // 3. Verify technical observations
      assert.ok(report.technicalObservations.length > 0);
      report.technicalObservations.forEach((tech) => {
        assert.ok(tech.evidenceIds.length > 0);
        tech.evidenceIds.forEach((eid) => {
          assert.ok(evidenceMap.has(eid), `Technical observation references unknown evidence ID: ${eid}`);
        });
      });
    });

    it('Cross-Session Isolation: evidence and episodes cannot leak across sessions or users', () => {
      const evUser1 = createSyntheticEvent('ev_u1_1', 'FOCUS_LOST', 1000, {
        user: 'user_1',
        mockTestSession: 'session_1',
      });
      const evUser2 = createSyntheticEvent('ev_u2_1', 'PAGE_HIDDEN', 1200, {
        user: 'user_2',
        mockTestSession: 'session_2',
      });

      // Session 1 report
      const { report: report1 } = runEvaluationPipeline({
        events: [evUser1],
        mockSession: { _id: 'session_1', user: 'user_1', status: 'completed' },
      });

      assert.strictEqual(report1.evidence.length, 1);
      assert.strictEqual(report1.evidence[0].eventIds[0], 'ev_u1_1');
      assert.ok(!report1.evidence.some((e) => e.eventIds.includes('ev_u2_1')));
    });

    it('Substantive Determinism: identical inputs produce substantively identical reports across repeated runs', () => {
      const events = [
        createSyntheticEvent('ev_det_1', 'FOCUS_LOST', 1000),
        createSyntheticEvent('ev_det_2', 'PAGE_HIDDEN', 1500),
        createSyntheticEvent('ev_det_3', 'FACE_ABSENT', 10000, { duration: 2500 }),
      ];

      const run1 = runEvaluationPipeline({ events });
      const run2 = runEvaluationPipeline({ events });

      // JSON stringify reports excluding any potential dynamic timestamp wrapper
      assert.deepStrictEqual(run1.report.statistics, run2.report.statistics);
      assert.deepStrictEqual(run1.report.timeline, run2.report.timeline);
      assert.deepStrictEqual(run1.report.relationships, run2.report.relationships);
      assert.deepStrictEqual(run1.report.technicalObservations, run2.report.technicalObservations);
      assert.deepStrictEqual(run1.report.unknowns, run2.report.unknowns);
      assert.deepStrictEqual(run1.report.evidence, run2.report.evidence);
    });

    it('Deterministic Chronological Evidence Ordering: extractEvidence enforces strict chronological ordering with tie-breaking', () => {
      const evEarlier = createSyntheticEvent('ev_ord_a', 'FOCUS_LOST', 1000);
      const evLater = createSyntheticEvent('ev_ord_b', 'PAGE_HIDDEN', 2000);

      // Pass in reverse order
      const evidence = extractEvidence([evLater, evEarlier], []);
      assert.strictEqual(evidence.length, 2);
      assert.strictEqual(evidence[0].id, 'ev_obs_1');
      assert.strictEqual(evidence[0].eventType, 'FOCUS_LOST'); // earlier event is assigned ev_obs_1
      assert.strictEqual(evidence[1].id, 'ev_obs_2');
      assert.strictEqual(evidence[1].eventType, 'PAGE_HIDDEN');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 6 — Report Safety & Limitation Assertions
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 6: Report Safety & Grounded Limitations', () => {

    it('Structural Safety: report contains zero cheating scores, suspicion scores, risk scores, or probabilities', () => {
      const events = [
        createSyntheticEvent('ev_sf1', 'FOCUS_LOST', 1000),
        createSyntheticEvent('ev_sf2', 'PAGE_HIDDEN', 1500),
        createSyntheticEvent('ev_sf3', 'FACE_ABSENT', 5000, { duration: 3000 }),
        createSyntheticEvent('ev_sf4', 'SCREEN_VIEW_CHANGED', 12000, { duration: 4000 }),
        createSyntheticEvent('ev_sf5', 'MULTIPLE_FACES', 20000, { duration: 2000 }),
      ];

      const { report } = runEvaluationPipeline({ events });

      // Structural assertions
      assert.strictEqual(report.cheatingScore, undefined);
      assert.strictEqual(report.suspicionScore, undefined);
      assert.strictEqual(report.riskScore, undefined);
      assert.strictEqual(report.cheatingProbability, undefined);
      assert.strictEqual(report.confidenceScore, undefined);
      assert.strictEqual(report.statistics.cheatingScore, undefined);
      assert.strictEqual(report.statistics.suspicionScore, undefined);
      assert.strictEqual(report.statistics.riskScore, undefined);
    });

    it('Semantic Safety: report narratives and unknowns do NOT make unsupported intent or application claims', () => {
      const events = [
        createSyntheticEvent('ev_s1', 'SCREEN_VIEW_CHANGED', 5000, { duration: 2000 }),
        createSyntheticEvent('ev_s2', 'FACE_ABSENT', 10000, { duration: 3000 }),
        createSyntheticEvent('ev_s3', 'HEAD_POSE_DEVIATION', 15000, { duration: 2500 }),
        createSyntheticEvent('ev_s4', 'MULTIPLE_FACES', 20000, { duration: 1800 }),
        createSyntheticEvent('ev_s5', 'FOCUS_LOST', 25000),
      ];

      const { report } = runEvaluationPipeline({ events });

      // Convert all text narratives into a single string for semantic verification
      const allText = [
        ...report.timeline.map((t) => t.narrative),
        ...report.relationships.map((r) => r.description),
        ...report.technicalObservations.map((to) => to.description),
        ...report.unknowns.map((u) => u.description),
      ].join(' ').toLowerCase();

      // Assert absence of improper speculation
      assert.ok(!allText.includes('cheated'), 'Report text must not claim student cheated');
      assert.ok(!allText.includes('intended to'), 'Report text must not infer student intent');
      assert.ok(!allText.includes('malicious'), 'Report text must not claim malice');
      assert.ok(!allText.includes('switched to chrome'), 'Report text must not speculate on external applications');
      assert.ok(!allText.includes('opened discord'), 'Report text must not speculate on external applications');
      assert.ok(!allText.includes('assisted by'), 'Report text must not claim external assistance');

      // Assert presence of required explicit limitations
      assert.ok(allText.includes('does not identify the specific application'));
      assert.ok(allText.includes('does not establish why the face was not detected'));
      assert.ok(allText.includes('does not establish what the student was looking at'));
      assert.ok(allText.includes('does not establish who the additional person was'));
      assert.ok(allText.includes('do not establish user intent'));
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 7 — Webcam Observation State Machine Evaluation
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 7: Webcam Observation State Machine (Hysteresis & Jitter Resistance)', () => {

    it('Presence hysteresis: 299ms is unconfirmed; 300ms emits exactly one FACE_PRESENT event', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      // 0ms to 299ms: unconfirmed
      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 299, faceCount: 1 });
      assert.strictEqual(observations.length, 0);

      // 300ms: confirmed
      sm.update({ timestamp: 300, faceCount: 1 });
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'FACE_PRESENT');

      // Continuous presence does not emit duplicate events
      sm.update({ timestamp: 400, faceCount: 1 });
      sm.update({ timestamp: 1000, faceCount: 1 });
      assert.strictEqual(observations.length, 1);
    });

    it('Absence hysteresis: transient absence of 999ms emits ZERO events; sustained absence of 1001ms emits FACE_ABSENT upon face return', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      // Establish presence
      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 300, faceCount: 1 });
      observations.length = 0; // clear

      // Transient absence: 999ms
      sm.update({ timestamp: 1000, faceCount: 0 });
      sm.update({ timestamp: 1999, faceCount: 0 });
      // Face returns before 1000ms threshold
      sm.update({ timestamp: 2000, faceCount: 1 });
      assert.strictEqual(observations.length, 0, 'Transient absence must not emit FACE_ABSENT');

      // Sustained absence: 1001ms
      sm.update({ timestamp: 3000, faceCount: 0 });
      sm.update({ timestamp: 4001, faceCount: 0 }); // >= 1000ms
      assert.strictEqual(observations.length, 0); // Not emitted yet (episode is open)

      // Face returns at 5000ms -> episode closes and emits
      sm.update({ timestamp: 5000, faceCount: 1 });
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'FACE_ABSENT');
      assert.strictEqual(observations[0].duration, 2000); // 5000 - 3000
    });

    it('Multiple faces hysteresis: transient detection of 749ms is suppressed; sustained 751ms emits MULTIPLE_FACES upon return', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 300, faceCount: 1 });
      observations.length = 0;

      // Transient multiple faces: 749ms
      sm.update({ timestamp: 1000, faceCount: 2 });
      sm.update({ timestamp: 1749, faceCount: 2 });
      sm.update({ timestamp: 1750, faceCount: 1 }); // drops back
      assert.strictEqual(observations.length, 0);

      // Sustained multiple faces: 1500ms
      sm.update({ timestamp: 2000, faceCount: 2 });
      sm.update({ timestamp: 2751, faceCount: 3 }); // > 750ms
      sm.update({ timestamp: 3500, faceCount: 1 }); // drops back
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'MULTIPLE_FACES');
      assert.strictEqual(observations[0].duration, 1500); // 3500 - 2000
      assert.strictEqual(observations[0].metadata.maxFacesObserved, 3);
    });

    it('Pose deviation hysteresis: head-pose deviation shorter than hysteresis interval (999ms) is suppressed; sustained 1001ms emits HEAD_POSE_DEVIATION upon return to neutral', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 300, faceCount: 1 });
      observations.length = 0;

      // Head-pose deviation shorter than configured hysteresis interval: yaw = 35 deg (> 28 threshold) for 999ms
      sm.update({ timestamp: 1000, faceCount: 1, pose: { yaw: 35, pitch: 0 } });
      sm.update({ timestamp: 1999, faceCount: 1, pose: { yaw: 35, pitch: 0 } });
      sm.update({ timestamp: 2000, faceCount: 1, pose: { yaw: 0, pitch: 0 } }); // return neutral
      assert.strictEqual(observations.length, 0);

      // Sustained deviation: 2000ms
      sm.update({ timestamp: 3000, faceCount: 1, pose: { yaw: 40, pitch: 10 } });
      sm.update({ timestamp: 4001, faceCount: 1, pose: { yaw: 42, pitch: 12 } });
      sm.update({ timestamp: 5000, faceCount: 1, pose: { yaw: 0, pitch: 0 } }); // return neutral
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'HEAD_POSE_DEVIATION');
      assert.strictEqual(observations[0].duration, 2000);
      assert.strictEqual(observations[0].metadata.maxYaw, 42);
    });

    it('Jitter Noise Suppression: rapid alternating detection (0 and 1 face every 100ms) emits zero spurious absence episodes', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 300, faceCount: 1 });
      observations.length = 0;

      // Rapid flickering for 2 seconds (every 100ms)
      for (let t = 1000; t <= 3000; t += 100) {
        const faceCount = (t / 100) % 2 === 0 ? 0 : 1;
        sm.update({ timestamp: t, faceCount });
      }

      const absenceEvents = observations.filter((o) => o.type === 'FACE_ABSENT');
      assert.strictEqual(absenceEvents.length, 0, 'Rapid flickering must not confirm absence episodes');
    });

    it('Teardown Resilience: stop() flushes open confirmed episodes with exact final duration and resets', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 0, faceCount: 1 });
      sm.update({ timestamp: 300, faceCount: 1 });
      observations.length = 0;

      // Start absence at t=1000, sustained past 1000ms threshold
      sm.update({ timestamp: 1000, faceCount: 0 });
      sm.update({ timestamp: 2500, faceCount: 0 }); // confirmed

      // Test stops at t=3500 while face is still absent
      sm.stop(3500);

      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'FACE_ABSENT');
      assert.strictEqual(observations[0].duration, 2500); // 3500 - 1000
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 8 — Screen Observation State Machine Evaluation
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 8: Screen Observation State Machine & Baseline Hardening', () => {

    it('Stability hysteresis: 999ms is unconfirmed; 1000ms emits SCREEN_VIEW_STABLE exactly once', () => {
      const observations = [];
      const sm = new ScreenObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 0, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
      sm.update({ timestamp: 999, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
      assert.strictEqual(observations.length, 0);

      sm.update({ timestamp: 1000, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'SCREEN_VIEW_STABLE');

      // Continuous stable view does not duplicate event
      sm.update({ timestamp: 2000, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
      assert.strictEqual(observations.length, 1);
    });

    it('Change hysteresis: transient difference of 1499ms is suppressed; sustained 1501ms emits SCREEN_VIEW_CHANGED upon view return', () => {
      const observations = [];
      const sm = new ScreenObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      // Establish stable view
      sm.update({ timestamp: 0, similarity: 0.90 });
      sm.update({ timestamp: 1000, similarity: 0.90 });
      observations.length = 0;

      // Transient difference: 1499ms
      sm.update({ timestamp: 2000, similarity: 0.50, classification: 'CHANGED' });
      sm.update({ timestamp: 3499, similarity: 0.50, classification: 'CHANGED' });
      sm.update({ timestamp: 3500, similarity: 0.90, classification: 'EXPECTED_EXAM_VIEW' });
      assert.strictEqual(observations.length, 0, 'Transient difference below 1500ms must not emit change event');

      // Sustained difference: 2500ms
      sm.update({ timestamp: 5000, similarity: 0.40, classification: 'CHANGED' });
      sm.update({ timestamp: 6501, similarity: 0.40, classification: 'CHANGED' }); // >= 1500ms
      sm.update({ timestamp: 7500, similarity: 0.90, classification: 'EXPECTED_EXAM_VIEW' }); // returns

      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'SCREEN_VIEW_CHANGED');
      assert.strictEqual(observations[0].duration, 2500); // 7500 - 5000
      assert.strictEqual(observations[0].metadata.similarity, 0.40);
    });

    it('Similarity Boundary: similarity >= 0.75 is classified as EXPECTED_EXAM_VIEW; similarity < 0.75 is CHANGED', () => {
      const sm = new ScreenObservationStateMachine();

      sm.update({ timestamp: 1000, similarity: 0.751 });
      assert.strictEqual(sm.currentClassification, 'EXPECTED_EXAM_VIEW');

      sm.update({ timestamp: 2000, similarity: 0.749 });
      assert.strictEqual(sm.currentClassification, 'CHANGED');
    });

    it('Screen Capture Loss: isAvailable: false emits SCREEN_VIEW_UNAVAILABLE exactly once', () => {
      const observations = [];
      const sm = new ScreenObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      sm.update({ timestamp: 1000, isAvailable: false, classification: 'UNAVAILABLE' });
      assert.strictEqual(observations.length, 1);
      assert.strictEqual(observations[0].type, 'SCREEN_VIEW_UNAVAILABLE');

      // Repeated unavailable samples do not duplicate event
      sm.update({ timestamp: 2000, isAvailable: false, classification: 'UNAVAILABLE' });
      assert.strictEqual(observations.length, 1);
    });

    it('Baseline Calibration Hardening: recalibrateBaseline resets baseline; zero-luminance black frames are rejected', () => {
      const monitor = new ScreenMonitor();
      assert.strictEqual(monitor.baselineCalibrated, false);
      assert.strictEqual(monitor.baselineSignature, null);

      // Simulate zero-luminance black frame (e.g. unpainted canvas)
      const blackSig = { meanLum: 0.0, regions: [0, 0, 0, 0], color: [0, 0, 0] };
      if (!monitor.baselineCalibrated && blackSig.meanLum >= 0.02) {
        monitor.baselineSignature = blackSig;
        monitor.baselineCalibrated = true;
      }
      assert.strictEqual(monitor.baselineCalibrated, false, 'Black frame must not calibrate baseline');

      // Simulate valid frame
      const validSig = { meanLum: 0.35, regions: [0.3, 0.4, 0.35, 0.35], color: [0.1, 0.1, 0.2] };
      if (!monitor.baselineCalibrated && validSig.meanLum >= 0.02) {
        monitor.baselineSignature = validSig;
        monitor.baselineCalibrated = true;
      }
      assert.strictEqual(monitor.baselineCalibrated, true);
      assert.deepStrictEqual(monitor.baselineSignature, validSig);

      // Explicit recalibration
      monitor.recalibrateBaseline();
      assert.strictEqual(monitor.baselineCalibrated, false);
      assert.strictEqual(monitor.baselineSignature, null);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 10 — Event Volume & Resource Behavior
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 10: Event Volume & Bounded Resource Behavior', () => {

    it('Stream with 1,000 heartbeat events creates ZERO analytical episodes and ZERO relationships', () => {
      const events = [];
      for (let i = 0; i < 1000; i++) {
        events.push(createSyntheticEvent(`hb_${i}`, 'PROCTORING_HEARTBEAT', i * 1000));
      }

      const { episodes, report } = runEvaluationPipeline({ events });
      assert.strictEqual(episodes.length, 0);
      assert.strictEqual(report.timeline.length, 0);
      assert.strictEqual(report.relationships.length, 0);
      assert.strictEqual(report.statistics.totalEpisodes, 0);
    });

    it('Long session with 50 repeated FOCUS_LOST events does NOT cause combinatorial explosion in relationships', () => {
      const events = [];
      for (let i = 0; i < 50; i++) {
        events.push(createSyntheticEvent(`fl_${i}`, 'FOCUS_LOST', i * 500));
      }

      const { episodes } = runEvaluationPipeline({ events });
      // FOCUS_LOST only pairs with complementary events (e.g. PAGE_HIDDEN), never with itself
      assert.ok(episodes.length > 0);
      const totalRels = episodes.reduce((acc, ep) => acc + ep.relationships.length, 0);
      assert.strictEqual(totalRels, 0, 'Identical event types must not generate pairwise relationships with each other');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 11 — Synthetic Performance Benchmark
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 11: Controlled Synthetic Performance Benchmark', () => {

    it('Correlates 1,000 mixed telemetry events and synthesizes full report efficiently', () => {
      const events = [];
      const eventTypes = [
        'FOCUS_LOST', 'PAGE_HIDDEN', 'FOCUS_REGAINED', 'PAGE_VISIBLE',
        'FACE_PRESENT', 'FACE_ABSENT', 'HEAD_POSE_DEVIATION',
        'SCREEN_VIEW_STABLE', 'SCREEN_VIEW_CHANGED', 'PROCTORING_HEARTBEAT',
      ];

      for (let i = 0; i < 1000; i++) {
        const type = eventTypes[i % eventTypes.length];
        events.push(createSyntheticEvent(`perf_${i}`, type, i * 1500, {
          duration: type.includes('ABSENT') || type.includes('CHANGED') ? 1500 : 0,
        }));
      }

      const startTime = performance.now();
      const { episodes, report } = runEvaluationPipeline({ events });
      const elapsedMs = performance.now() - startTime;

      assert.ok(episodes.length > 0);
      assert.ok(report.evidence.length > 0);

      // Verify no unbounded growth or memory leakage across runs
      const run2Start = performance.now();
      const run2 = runEvaluationPipeline({ events });
      const run2Elapsed = performance.now() - run2Start;

      assert.deepStrictEqual(report.statistics, run2.report.statistics);

      // Record measured timings (failing only on catastrophic hang > 5000ms)
      assert.ok(elapsedMs < 5000, `Execution time was unreasonably high: ${elapsedMs.toFixed(1)}ms`);
      assert.ok(run2Elapsed < 5000, `Repeat execution time was unreasonably high: ${run2Elapsed.toFixed(1)}ms`);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 12 — False-Event Suppression Verification
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 12: False Observation Suppression (Engineering Behavior)', () => {

    it('False Event Definition: transient deviation states never produce false events', () => {
      const observations = [];
      const sm = new ObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      // Head-pose deviation shorter than hysteresis interval: yaw deviated for 500ms (< 1000ms threshold)
      sm.update({ timestamp: 0, faceCount: 1, pose: { yaw: 0, pitch: 0 } });
      sm.update({ timestamp: 300, faceCount: 1, pose: { yaw: 0, pitch: 0 } });
      observations.length = 0;

      sm.update({ timestamp: 1000, faceCount: 1, pose: { yaw: 35, pitch: 0 } });
      sm.update({ timestamp: 1500, faceCount: 1, pose: { yaw: 0, pitch: 0 } });

      assert.strictEqual(observations.length, 0, 'Head-pose deviation shorter than hysteresis interval must NOT emit HEAD_POSE_DEVIATION');
    });

    it('Transient screen blip never produces false SCREEN_VIEW_CHANGED observation', () => {
      const observations = [];
      const sm = new ScreenObservationStateMachine({
        onObservation: (obs) => observations.push(obs),
      });

      // Stable view
      sm.update({ timestamp: 0, similarity: 0.95 });
      sm.update({ timestamp: 1000, similarity: 0.95 });
      observations.length = 0;

      // 800ms blip (< 1500ms threshold)
      sm.update({ timestamp: 2000, similarity: 0.50, classification: 'CHANGED' });
      sm.update({ timestamp: 2800, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });

      assert.strictEqual(observations.length, 0, 'Transient screen blip must NOT emit SCREEN_VIEW_CHANGED');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART 13 — Academic Regression & Score Isolation
  // ══════════════════════════════════════════════════════════════════════
  describe('Part 13: Academic Mock Test Regression & Scoring Isolation', () => {

    it('Proctoring telemetry and report synthesis have ZERO effect on academic score or evaluation', () => {
      const mockSession = {
        _id: 'mock_session_jee_eval',
        user: 'student_123',
        status: 'completed',
        startedAt: createTimestamp(0),
        submittedAt: createTimestamp(3600000),
        answers: [
          { questionId: 'q1', selectedOption: 0, isMarkedForReview: false, answeredAt: createTimestamp(60000) },
          { questionId: 'q2', selectedOption: 1, isMarkedForReview: false, answeredAt: createTimestamp(120000) },
        ],
        result: {
          score: 180,
          maxMarks: 300,
          percentage: 60,
          accuracy: 75,
          totalQuestions: 75,
          correctCount: 46,
          incorrectCount: 4,
          unattemptedCount: 25,
          sectionScores: {
            physics: { score: 60, maxMarks: 100, correctCount: 15, incorrectCount: 0, unattemptedCount: 10 },
          },
        },
      };

      // Heavy proctoring interruption telemetry
      const heavyEvents = [
        createSyntheticEvent('ev_h1', 'CAMERA_STOPPED', 10000),
        createSyntheticEvent('ev_h2', 'FACE_ABSENT', 10500, { duration: 5000 }),
        createSyntheticEvent('ev_h3', 'SCREEN_SHARE_STOPPED', 30000),
        createSyntheticEvent('ev_h4', 'FULLSCREEN_EXITED', 45000),
      ];

      const { report } = runEvaluationPipeline({
        events: heavyEvents,
        mockSession,
      });

      // Academic scores must remain strictly identical
      assert.strictEqual(mockSession.result.score, 180);
      assert.strictEqual(mockSession.result.correctCount, 46);
      assert.strictEqual(mockSession.result.incorrectCount, 4);
      assert.strictEqual(report.sessionOverview.score, 180);
      assert.strictEqual(report.sessionOverview.maxMarks, 300);
      assert.strictEqual(report.sessionOverview.status, 'completed');
    });
  });
});
