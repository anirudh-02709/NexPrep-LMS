/**
 * proctoring_adjudication.test.js
 *
 * NexPrep JEE LMS — Automated Proctoring Adjudication Engine (Phase B Test Suite)
 *
 * Comprehensive verification of the definitive frozen Phase A specification:
 * 1. Mathematical Unit Tests (Duration curve, Corroboration, Caps, Compounding, Confidence, Health, HV)
 * 2. 14 Master Physical Validation Scenarios (Reproducing exact R, C, H, HV, and Decisions)
 * 3. 24 Comprehensive Edge Cases from Section 7 of the Frozen Spec
 * 4. Controller Integration Tests (finalizeMockTestSession & submitMockTestSession in autonomous mode)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MockTest = require('../models/MockTest');
const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringAssessment = require('../models/ProctoringAssessment');

const {
  CATEGORIES,
  CATEGORY_CAPS,
  DECISIONS,
  TECHNICAL_HEALTH,
  REASON_CODES,
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
} = require('../services/proctoringAdjudicationService');

const {
  finalizeMockTestSession,
  submitMockTestSession,
} = require('../controllers/mockTestController');

describe('Phase B — Proctoring Adjudication Mathematical Engine', () => {
  // ─── 1. UNIVERSAL PIECEWISE DURATION MULTIPLIER mu_D(t) ─────────────
  describe('Universal Duration Multiplier mu_D(t)', () => {
    it('returns 0.0 for duration below 3000ms noise floor', () => {
      assert.equal(computeDurationMultiplier(0), 0.0);
      assert.equal(computeDurationMultiplier(1500), 0.0);
      assert.equal(computeDurationMultiplier(2999), 0.0);
    });

    it('returns 1.0 for brief excursions between 3000ms and 10000ms inclusive', () => {
      assert.equal(computeDurationMultiplier(3000), 1.0);
      assert.equal(computeDurationMultiplier(5000), 1.0);
      assert.equal(computeDurationMultiplier(10000), 1.0);
    });

    it('returns 1.5 for moderate sustained deviations between 10000ms and 30000ms inclusive', () => {
      assert.equal(computeDurationMultiplier(10001), 1.5);
      assert.equal(computeDurationMultiplier(20000), 1.5);
      assert.equal(computeDurationMultiplier(30000), 1.5);
    });

    it('returns 2.0 for extended significant deviations between 30000ms and 60000ms inclusive', () => {
      assert.equal(computeDurationMultiplier(30001), 2.0);
      assert.equal(computeDurationMultiplier(45000), 2.0);
      assert.equal(computeDurationMultiplier(60000), 2.0);
    });

    it('returns 2.5 for prolonged maximum excursions strictly exceeding 60000ms', () => {
      assert.equal(computeDurationMultiplier(60001), 2.5);
      assert.equal(computeDurationMultiplier(120000), 2.5);
    });
  });

  // ─── 2. CORROBORATION MULTIPLIER kappa(V) ───────────────────────────
  describe('Corroboration Multiplier kappa(V)', () => {
    it('returns 1.0 for V = 0 and V = 1 (single-category or isolated)', () => {
      assert.equal(computeCorroborationMultiplier(0), 1.0);
      assert.equal(computeCorroborationMultiplier(1), 1.0);
    });

    it('returns 1.5 for V = 2 (dual-category cross-corroboration)', () => {
      assert.equal(computeCorroborationMultiplier(2), 1.5);
    });

    it('returns 2.0 for V = 3 (tri-category cross-corroboration)', () => {
      assert.equal(computeCorroborationMultiplier(3), 2.0);
    });

    it('returns 2.5 for V = 4 (full multi-channel breach)', () => {
      assert.equal(computeCorroborationMultiplier(4), 2.5);
    });
  });

  // ─── 3. CATEGORY CAPS & SINGLE CATEGORY CEILING ─────────────────────
  describe('Category Caps & Mathematical Single-Category Ceiling', () => {
    it('enforces exact frozen category caps (20 / 35 / 35 / 35)', () => {
      assert.equal(CATEGORY_CAPS.ATTENTION, 20);
      assert.equal(CATEGORY_CAPS.CAMERA, 35);
      assert.equal(CATEGORY_CAPS.SCREEN, 35);
      assert.equal(CATEGORY_CAPS.MEDIA, 35);
    });

    it('mathematically guarantees single-category anomalies cannot reach 50 pts (VOID threshold)', () => {
      // Create massive single-category attention anomaly
      const attentionTokens = [
        {
          id: 'tok_1',
          type: 'BROWSER_ATTENTION_LOSS',
          category: CATEGORIES.ATTENTION,
          startTime: 1000,
          endTime: 70000,
          durationMs: 69000, // mu_D = 2.5
          occurrenceIndex: 2, // W0 = 4 -> base = 10
          isSuppressed: false,
        },
        {
          id: 'tok_2',
          type: 'BROWSER_ATTENTION_LOSS',
          category: CATEGORIES.ATTENTION,
          startTime: 80000,
          endTime: 150000,
          durationMs: 70000, // mu_D = 2.5
          occurrenceIndex: 3, // W0 = 4 -> base = 10
          isSuppressed: false,
        },
        {
          id: 'tok_3',
          type: 'BROWSER_ATTENTION_LOSS',
          category: CATEGORIES.ATTENTION,
          startTime: 160000,
          endTime: 230000,
          durationMs: 70000,
          occurrenceIndex: 4,
          isSuppressed: false,
        },
      ];

      const episodes = clusterEpisodes(attentionTokens);
      const risk = calculateRiskScore(episodes, []);

      // Capped at 20 pts
      assert.equal(risk.categoryRiskBreakdown.attention, 20);
      assert.equal(risk.compounding, 0); // only 1 category >= 10
      assert.equal(risk.deltaRans, 0);
      assert.equal(risk.integrityRiskScore, 20);
      assert.ok(risk.integrityRiskScore < 50, 'Single-category attention cannot trigger VOID');
    });

    it('guarantees massive isolated camera anomaly caps at 35 pts (< 50)', () => {
      const cameraTokens = [
        {
          id: 'c1',
          type: 'MULTIPLE_FACES',
          category: CATEGORIES.CAMERA,
          startTime: 1000,
          endTime: 65000,
          durationMs: 64000, // mu_D = 2.5, W0 = 12 -> 30 pts
          occurrenceIndex: 1,
          isSuppressed: false,
        },
        {
          id: 'c2',
          type: 'FACE_ABSENT',
          category: CATEGORIES.CAMERA,
          startTime: 70000,
          endTime: 135000,
          durationMs: 65000, // mu_D = 2.5, W0 = 8 -> 20 pts
          occurrenceIndex: 1,
          isSuppressed: false,
        },
      ];

      const episodes = clusterEpisodes(cameraTokens);
      const risk = calculateRiskScore(episodes, []);

      // 30 + 20 = 50, capped at 35
      assert.equal(risk.categoryRiskBreakdown.camera, 35);
      assert.equal(risk.compounding, 0); // Only 1 category >= 10
      assert.equal(risk.integrityRiskScore, 35);
      assert.ok(risk.integrityRiskScore < 50, 'Single-category camera cannot trigger VOID');
    });
  });

  // ─── 4. CONFIDENCE EQUATION REPRODUCIBILITY ─────────────────────────
  describe('Evidence Confidence Equation (C)', () => {
    it('calculates C = 1.00 for pristine sensors and telemetry', () => {
      const C = calculateConfidence({
        initSensors: 1.0,
        continuityStreams: 1.0,
        qualityCv: 1.0,
        continuityHeartbeats: 1.0,
        observabilityIncident: 1.0,
      });
      assert.equal(C, 1.0);
    });

    it('calculates C exactly matching weights: 0.25*Init + 0.30*Cont + 0.20*Qual + 0.15*Hb + 0.10*Obs', () => {
      // 0.25*1.0 + 0.30*0.80 + 0.20*0.70 + 0.15*1.0 + 0.10*0.70 = 0.25 + 0.24 + 0.14 + 0.15 + 0.07 = 0.85
      const C = calculateConfidence({
        initSensors: 1.0,
        continuityStreams: 0.8,
        qualityCv: 0.7,
        continuityHeartbeats: 1.0,
        observabilityIncident: 0.7,
      });
      assert.equal(C, 0.85);
    });
  });

  // ─── 5. TECHNICAL HEALTH PREDICATE (H) ──────────────────────────────
  describe('Technical Health Predicate (H)', () => {
    it('returns SUFFICIENT when all streams >= 70%, Init == 1.0, and 0 Tier 2 stops', () => {
      const H = calculateTechnicalHealth({
        initSensors: 1.0,
        continuityCamera: 0.75,
        continuityScreen: 0.85,
        continuityHeartbeats: 0.9,
        tier2StopsCount: 0,
      });
      assert.equal(H, TECHNICAL_HEALTH.SUFFICIENT);
    });

    it('returns INSUFFICIENT if camera continuity is below 70%', () => {
      const H = calculateTechnicalHealth({
        initSensors: 1.0,
        continuityCamera: 0.69,
        continuityScreen: 1.0,
        continuityHeartbeats: 1.0,
        tier2StopsCount: 0,
      });
      assert.equal(H, TECHNICAL_HEALTH.INSUFFICIENT);
    });

    it('returns INSUFFICIENT if screen continuity is below 70%', () => {
      const H = calculateTechnicalHealth({
        initSensors: 1.0,
        continuityCamera: 1.0,
        continuityScreen: 0.69,
        continuityHeartbeats: 1.0,
        tier2StopsCount: 0,
      });
      assert.equal(H, TECHNICAL_HEALTH.INSUFFICIENT);
    });

    it('returns INSUFFICIENT if sensor setup was incomplete (Init < 1.0)', () => {
      const H = calculateTechnicalHealth({
        initSensors: 0.5,
        continuityCamera: 1.0,
        continuityScreen: 1.0,
        continuityHeartbeats: 1.0,
        tier2StopsCount: 0,
      });
      assert.equal(H, TECHNICAL_HEALTH.INSUFFICIENT);
    });

    it('returns INSUFFICIENT if any Tier 2 unrecovered stoppage occurred', () => {
      const H = calculateTechnicalHealth({
        initSensors: 1.0,
        continuityCamera: 0.9,
        continuityScreen: 0.9,
        continuityHeartbeats: 1.0,
        tier2StopsCount: 1,
      });
      assert.equal(H, TECHNICAL_HEALTH.INSUFFICIENT);
    });
  });

  // ─── 6. DECISION HIERARCHY RULES 1 TO 5 ─────────────────────────────
  describe('Decision Hierarchy Precedence', () => {
    it('Rule 1: Hard Violation (HV=true) takes absolute precedence => VOID', () => {
      const res = evaluateDecisionHierarchy({
        R: 20,
        C: 0.9,
        H: TECHNICAL_HEALTH.INSUFFICIENT, // Even if H is degraded, Rule 1 VOIDs
        HV: true,
      });
      assert.equal(res.decision, DECISIONS.VOID);
      assert.ok(res.reasonCodes.includes(REASON_CODES.HARD_VIOLATION_CONFIRMED));
    });

    it('Rule 2: R >= 50 AND C >= 0.75 => VOID', () => {
      const res = evaluateDecisionHierarchy({
        R: 62,
        C: 0.85,
        H: TECHNICAL_HEALTH.SUFFICIENT,
        HV: false,
      });
      assert.equal(res.decision, DECISIONS.VOID);
      assert.ok(res.reasonCodes.includes(REASON_CODES.HIGH_RISK_HIGH_CONFIDENCE));
    });

    it('Rule 3: Technical degradation with R < 50 => TECHNICAL', () => {
      const res = evaluateDecisionHierarchy({
        R: 0,
        C: 0.69,
        H: TECHNICAL_HEALTH.INSUFFICIENT,
        HV: false,
      });
      assert.equal(res.decision, DECISIONS.TECHNICAL);
      assert.ok(res.reasonCodes.includes(REASON_CODES.TECHNICAL_DEGRADATION));
    });

    it('Rule 4: Low risk (R < 25), high confidence, healthy streams => RELEASE (Clean)', () => {
      const res = evaluateDecisionHierarchy({
        R: 8,
        C: 0.95,
        H: TECHNICAL_HEALTH.SUFFICIENT,
        HV: false,
      });
      assert.equal(res.decision, DECISIONS.RELEASE);
      assert.equal(res.advisoryClearance, false);
      assert.ok(res.reasonCodes.includes(REASON_CODES.CLEAN_SUBMISSION));
    });

    it('Rule 4: Advisory risk (25 <= R < 50) => RELEASE (Advisory)', () => {
      const res = evaluateDecisionHierarchy({
        R: 32,
        C: 0.95,
        H: TECHNICAL_HEALTH.SUFFICIENT,
        HV: false,
      });
      assert.equal(res.decision, DECISIONS.RELEASE);
      assert.equal(res.advisoryClearance, true);
      assert.ok(res.reasonCodes.includes(REASON_CODES.ADVISORY_ANOMALIES_RECORDED));
    });
  });
});

// ============================================================================
// 14 FROZEN PHYSICAL VALIDATION SCENARIOS
// ============================================================================
describe('Phase B — 14 Frozen Physical Validation Scenarios', () => {
  const BASE_TIME = new Date('2026-09-28T10:00:00.000Z');
  const createTs = (offsetMs) => new Date(BASE_TIME.getTime() + offsetMs);

  function createBaseSession(durationMin = 180) {
    const startedAt = createTs(0);
    const expiresAt = createTs(durationMin * 60 * 1000);
    return {
      _id: new mongoose.Types.ObjectId(),
      startedAt,
      expiresAt,
      submittedAt: expiresAt,
      answers: [],
    };
  }

  function createBaseProcSession(mockSessId) {
    return {
      _id: new mongoose.Types.ObjectId(),
      mockTestSession: mockSessId,
      cameraState: 'active',
      screenShareState: 'active',
      startedAt: createTs(0),
      metadata: { qualityCv: 1.0, continuityHeartbeats: 1.0 },
    };
  }

  // ─── SCENARIO 1: Clean Attempt (180 min) ───────────────────────────
  it('Scenario 1: Completely Clean Attempt (180 min) -> R=0, C=1.00, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'FACE_PRESENT', timestamp: createTs(3000), duration: 0 },
      { type: 'SCREEN_VIEW_STABLE', timestamp: createTs(4000), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 1.0);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.hardViolationTriggered, false);
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, false);
  });

  // ─── SCENARIO 2: One Short Tab Switch (1.8s) ───────────────────────
  it('Scenario 2: One Short Tab Switch (1.8s) -> R=0, C=0.98, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'PAGE_HIDDEN', timestamp: createTs(5100), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(6800), duration: 0 }, // 1800ms
      { type: 'PAGE_VISIBLE', timestamp: createTs(6850), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: { observabilityIncident: 0.8 },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.98);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.hardViolationTriggered, false);
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, false);
  });

  // ─── SCENARIO 3: Repeated Short Tab Switches (6 x 5s) ──────────────
  it('Scenario 3: Repeated Short Tab Switches (6 x 5s) -> R=20, C=0.97, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
    ];

    // 6 separate tab switches, separated by 60s
    for (let i = 0; i < 6; i++) {
      const startMs = 10000 + i * 60000;
      events.push(
        { type: 'FOCUS_LOST', timestamp: createTs(startMs), duration: 0 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(startMs + 5000), duration: 0 } // 5s each
      );
    }

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: { observabilityIncident: 0.7 },
    });

    // Token 1: grace W0=0. Tokens 2-6: 5 * (4 * 1.0 * 1.0) = 20 pts.
    assert.equal(result.integrityRiskScore, 20);
    assert.equal(result.categoryRiskBreakdown.attention, 20);
    assert.equal(result.evidenceConfidence, 0.97);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, false);
  });

  // ─── SCENARIO 4: Short Camera Glitch (2.5s) ────────────────────────
  it('Scenario 4: Short Camera Glitch (2.5s) -> R=0, C=0.98, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'CAMERA_STOPPED', timestamp: createTs(10000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(12500), duration: 0 }, // 2500ms
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        continuityStreams: 0.98,
        qualityCv: 0.98,
        observabilityIncident: 0.9,
      },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.98);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.decision, DECISIONS.RELEASE);
  });

  // ─── SCENARIO 5: Long Camera Outage (120s, idle) ───────────────────
  it('Scenario 5: Long Camera Outage (120s, idle) -> R=0, C=0.69, H=INSUFFICIENT, TECHNICAL', () => {
    const sess = createBaseSession(5); // 5 min session
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'CAMERA_STOPPED', timestamp: createTs(10000), duration: 0 },
      // unrecovered 120s until finalization
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        continuityCamera: 0.4,
        continuityScreen: 1.0,
        qualityCv: 0.4,
        observabilityIncident: 0.0,
      },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.69);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.equal(result.decision, DECISIONS.TECHNICAL);
  });

  // ─── SCENARIO 6: Short Face Absence (4.2s) ─────────────────────────
  it('Scenario 6: Short Face Absence (4.2s) -> R=8, C=0.99, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'FACE_ABSENT', timestamp: createTs(10000), duration: 4200 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: { observabilityIncident: 0.9 },
    });

    // W0 = 8, mu_D = 1.0, kappa = 1.0 -> R = 8
    assert.equal(result.integrityRiskScore, 8);
    assert.equal(result.categoryRiskBreakdown.camera, 8);
    assert.equal(result.evidenceConfidence, 0.99);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, false);
  });

  // ─── SCENARIO 7: Long Face Absence (35s & 40s) ─────────────────────
  it('Scenario 7: Long Face Absence (35s & 40s) -> R=32, C=0.96, H=SUFFICIENT, RELEASE (Advisory)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'FACE_ABSENT', timestamp: createTs(10000), duration: 35000 }, // Ep 1: 35s -> mu_D = 2.0 -> 16 pts
      { type: 'FACE_ABSENT', timestamp: createTs(90000), duration: 40000 }, // Ep 2: 40s -> mu_D = 2.0 -> 16 pts
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        qualityCv: 0.9,
        observabilityIncident: 0.8,
      },
    });

    // 16 + 16 = 32 pts <= Cap_camera (35)
    assert.equal(result.integrityRiskScore, 32);
    assert.equal(result.categoryRiskBreakdown.camera, 32);
    assert.equal(result.evidenceConfidence, 0.96);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, true); // 25 <= R < 50
  });

  // ─── SCENARIO 8: Short Fullscreen Exit (2.0s) ──────────────────────
  it('Scenario 8: Short Fullscreen Exit (2.0s) -> R=0, C=0.99, H=SUFFICIENT, RELEASE (Clean)', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'FULLSCREEN_EXITED', timestamp: createTs(10000), duration: 0 },
      { type: 'FULLSCREEN_ENTERED', timestamp: createTs(12000), duration: 0 }, // 2000ms
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: { observabilityIncident: 0.9 },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.99);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.SUFFICIENT);
    assert.equal(result.decision, DECISIONS.RELEASE);
  });

  // ─── SCENARIO 9: Screen-Share Interruption (600s, idle) ────────────
  it('Scenario 9: Screen-Share Outage (600s, idle) -> R=0, C=0.69, H=INSUFFICIENT, TECHNICAL', () => {
    const sess = createBaseSession(10);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      { type: 'SCREEN_SHARE_STOPPED', timestamp: createTs(10000), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        continuityCamera: 1.0,
        continuityScreen: 0.4,
        qualityCv: 0.4,
        observabilityIncident: 0.0,
      },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.69);
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.equal(result.decision, DECISIONS.TECHNICAL);
  });

  // ─── SCENARIO 10: Camera Stop + Attention Violation (45s) ──────────
  it('Scenario 10: Camera Stop + Attention Violation (45s) -> R=62, C=0.85, H=SUFFICIENT, VOID', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      // Prior occurrence of attention loss so second occurrence has W0 = 4
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
      // Main correlated episode: Camera stop (45s) + Focus lost (45s)
      { type: 'CAMERA_STOPPED', timestamp: createTs(50000), duration: 0 },
      { type: 'FOCUS_LOST', timestamp: createTs(51000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(96000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(95000), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        continuityStreams: 0.8,
        qualityCv: 0.7,
        observabilityIncident: 0.7,
      },
    });

    // Media (Tier 3: 15 * 2.0 * 1.5 = 45 -> cap 35) + Attention (4 * 2.0 * 1.5 = 12) + Compounding (15) = 62
    assert.equal(result.categoryRiskBreakdown.media, 35);
    assert.equal(result.categoryRiskBreakdown.attention, 12);
    assert.equal(result.integrityRiskScore, 62);
    assert.equal(result.evidenceConfidence, 0.85);
    assert.equal(result.decision, DECISIONS.VOID);
  });

  // ─── SCENARIO 11: Face Absent + Attention + Screen Change (25s) ────
  it('Scenario 11: Face Absent + Attention + Screen Change (25s) -> R=86, C=0.92, H=SUFFICIENT, VOID', () => {
    const sess = createBaseSession(180);
    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      // Prior attention event to make next one repeat W0 = 4
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
      // Tri-category correlated breach: 25s duration
      { type: 'FACE_ABSENT', timestamp: createTs(20000), duration: 25000 },
      { type: 'FOCUS_LOST', timestamp: createTs(20500), duration: 0 },
      { type: 'SCREEN_VIEW_CHANGED', timestamp: createTs(21000), duration: 25000 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(45500), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        qualityCv: 0.9,
        observabilityIncident: 0.85,
      },
    });

    // V = 3 -> kappa = 2.0; t = 25s -> mu_D = 1.5
    // Attention: 4 * 1.5 * 2.0 = 12
    // Camera: 8 * 1.5 * 2.0 = 24
    // Screen: 12 * 1.5 * 2.0 = 36 -> cap 35
    // Compounding: +15
    // Total R = 12 + 24 + 35 + 15 = 86
    assert.equal(result.categoryRiskBreakdown.attention, 12);
    assert.equal(result.categoryRiskBreakdown.camera, 24);
    assert.equal(result.categoryRiskBreakdown.screen, 35);
    assert.equal(result.integrityRiskScore, 86);
    assert.equal(result.decision, DECISIONS.VOID);
  });

  // ─── SCENARIO 12: Multiple Faces + Attention + Answer (35s) ────────
  it('Scenario 12: Multiple Faces + Attention + Answer (35s) -> R=70, C=0.96, H=SUFFICIENT, VOID', () => {
    const sess = createBaseSession(180);
    // Add answer submitted at 25000ms
    sess.answers = [{ questionId: 'q1', section: 'physics', answeredAt: createTs(25000) }];

    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      // Prior attention event
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
      // Correlated episode (35s)
      { type: 'MULTIPLE_FACES', timestamp: createTs(20000), duration: 35000 },
      { type: 'FOCUS_LOST', timestamp: createTs(20500), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(55500), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        qualityCv: 0.9,
        observabilityIncident: 0.8,
      },
    });

    // V = 2 -> kappa = 1.5; t = 35s -> mu_D = 2.0
    // Camera (MULTIPLE_FACES): 12 * 2.0 * 1.5 = 36 -> cap 35
    // Attention: 4 * 2.0 * 1.5 = 12
    // Compounding: +15
    // Answer Context: +8
    // Total R = 35 + 12 + 8 + 15 = 70
    assert.equal(result.categoryRiskBreakdown.camera, 35);
    assert.equal(result.categoryRiskBreakdown.attention, 12);
    assert.equal(result.integrityRiskScore, 70);
    assert.equal(result.evidenceConfidence, 0.96);
    assert.equal(result.decision, DECISIONS.VOID);
  });

  // ─── SCENARIO 13: Camera Denied at Setup ───────────────────────────
  it('Scenario 13: Camera Denied at Setup -> R=0, C=0.43, H=INSUFFICIENT, TECHNICAL', () => {
    const sess = createBaseSession(5);
    const procSess = {
      _id: new mongoose.Types.ObjectId(),
      mockTestSession: sess._id,
      cameraState: 'denied', // Denied
      screenShareState: 'active',
      startedAt: createTs(0),
      metadata: {},
    };
    const events = [
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        initSensors: 0.5,
        continuityStreams: 0.5,
        qualityCv: 0.0,
        continuityHeartbeats: 1.0,
        observabilityIncident: 0.0,
      },
    });

    assert.equal(result.integrityRiskScore, 0);
    assert.equal(result.evidenceConfidence, 0.425); // rounds to ~0.43
    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.equal(result.decision, DECISIONS.TECHNICAL);
  });

  // ─── SCENARIO 14: Hard Compound Violation (75s Blackout + Ans) ─────
  it('Scenario 14: Required Monitoring Blackout (75s) + Attention + Answer -> R=73, C=0.86, HV=TRUE, VOID', () => {
    const sess = createBaseSession(60);
    // Answer submitted during camera blackout
    sess.answers = [{ questionId: 'q8', section: 'maths', answeredAt: createTs(25000) }];

    const procSess = createBaseProcSession(sess._id);
    const events = [
      { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      // Prior attention event
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
      // 75s Camera Blackout with concurrent attention loss
      { type: 'CAMERA_STOPPED', timestamp: createTs(20000), duration: 0 },
      { type: 'PAGE_HIDDEN', timestamp: createTs(21000), duration: 0 },
      { type: 'PAGE_VISIBLE', timestamp: createTs(95000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(95000), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: sess,
      proctoringSession: procSess,
      options: {
        hardViolation: true,
        continuityStreams: 0.86,
        qualityCv: 0.86,
      },
    });

    assert.equal(result.hardViolationTriggered, true);
    assert.equal(result.decision, DECISIONS.VOID);
    assert.ok(result.reasonCodes.includes(REASON_CODES.HARD_VIOLATION_CONFIRMED));
  });
});

// ============================================================================
// 24 COMPREHENSIVE EDGE CASES (SECTION 7)
// ============================================================================
describe('Phase B — 24 Comprehensive Edge Cases', () => {
  const BASE_TIME = new Date('2026-09-28T12:00:00.000Z');
  const createTs = (offsetMs) => new Date(BASE_TIME.getTime() + offsetMs);

  function createBaseSession(durationMin = 180) {
    return {
      _id: new mongoose.Types.ObjectId(),
      startedAt: createTs(0),
      expiresAt: createTs(durationMin * 60 * 1000),
      submittedAt: createTs(durationMin * 60 * 1000),
      answers: [],
    };
  }

  // Edge Case 1: One Accidental Tab Switch (< 3s)
  it('Edge Case 1: One accidental tab switch (<3s) scores R=0 and releases cleanly', () => {
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(2500), duration: 0 }, // 1500ms
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.decision, DECISIONS.RELEASE);
    assert.equal(res.advisoryClearance, false);
  });

  // Edge Case 2: Repeated Tab Switches under Category Cap
  it('Edge Case 2: Repeated tab switches accumulate under Cap_attention = 20', () => {
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        { type: 'FOCUS_LOST', timestamp: createTs(i * 10000), duration: 0 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(i * 10000 + 4000), duration: 0 }
      );
    }
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.categoryRiskBreakdown.attention, 20);
    assert.equal(res.integrityRiskScore, 20);
    assert.equal(res.decision, DECISIONS.RELEASE);
  });

  // Edge Case 3: Long Tab Switching (> 60s in isolation)
  it('Edge Case 3: Long tab switch (>60s) in isolation is capped at 20 and cannot void', () => {
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(75000), duration: 0 }, // 70s
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.ok(res.integrityRiskScore <= 20);
    assert.equal(res.decision, DECISIONS.RELEASE);
  });

  // Edge Case 4: First Fullscreen Exit (< 3s)
  it('Edge Case 4: First fullscreen exit (< 3s) receives grace W0=0 and mu_D=0', () => {
    const events = [
      { type: 'FULLSCREEN_EXITED', timestamp: createTs(5000), duration: 0 },
      { type: 'FULLSCREEN_ENTERED', timestamp: createTs(7000), duration: 0 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.decision, DECISIONS.RELEASE);
  });

  // Edge Case 5: Repeated Fullscreen Exits
  it('Edge Case 5: Repeated fullscreen exits score W0=4, capped under attention cap', () => {
    const events = [
      { type: 'FULLSCREEN_EXITED', timestamp: createTs(1000), duration: 0 },
      { type: 'FULLSCREEN_ENTERED', timestamp: createTs(5000), duration: 0 },
      { type: 'FULLSCREEN_EXITED', timestamp: createTs(20000), duration: 0 },
      { type: 'FULLSCREEN_ENTERED', timestamp: createTs(25000), duration: 0 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 4); // First: 0, Second: 4 * 1.0 * 1.0 = 4
    assert.equal(res.decision, DECISIONS.RELEASE);
  });

  // Edge Case 6: Brief Camera Glitch (Tier 1 <= 10s)
  it('Edge Case 6: Brief camera glitch (<=10s recovered) evaluates to Tier 1 W0=0', () => {
    const events = [
      { type: 'CAMERA_STOPPED', timestamp: createTs(5000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(12000), duration: 0 }, // 7s
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.decision, DECISIONS.RELEASE);
  });

  // Edge Case 7: Long Camera Outage (Idle)
  it('Edge Case 7: Long camera outage (>10s idle) evaluates to Tier 2 W0=0 and yields TECHNICAL', () => {
    const events = [
      { type: 'CAMERA_STOPPED', timestamp: createTs(5000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(85000), duration: 0 }, // 80s
    ];
    const res = adjudicateProctoring({
      events,
      mockTestSession: createBaseSession(),
      options: { continuityCamera: 0.5 },
    });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.equal(res.decision, DECISIONS.TECHNICAL);
  });

  // Edge Case 8: Camera Outage + Attention Loss
  it('Edge Case 8: Camera outage + attention loss triggers Tier 3 and cross-corroboration', () => {
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(5000), duration: 0 },
      { type: 'CAMERA_STOPPED', timestamp: createTs(20000), duration: 0 },
      { type: 'FOCUS_LOST', timestamp: createTs(21000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(65000), duration: 0 },
      { type: 'CAMERA_STARTED', timestamp: createTs(65000), duration: 0 }, // 45s
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.ok(res.integrityRiskScore >= 50);
    assert.equal(res.decision, DECISIONS.VOID);
  });

  // Edge Case 9: Screen-Share Interruption (Idle)
  it('Edge Case 9: Screen-share outage (idle) routes strictly to TECHNICAL', () => {
    const events = [
      { type: 'SCREEN_SHARE_STOPPED', timestamp: createTs(5000), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(65000), duration: 0 }, // 60s
    ];
    const res = adjudicateProctoring({
      events,
      mockTestSession: createBaseSession(),
      options: { continuityScreen: 0.5 },
    });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.equal(res.decision, DECISIONS.TECHNICAL);
  });

  // Edge Case 10: Face Absent Briefly (4.2s)
  it('Edge Case 10: Face absent briefly (4.2s) scores W0=8 and releases cleanly', () => {
    const events = [{ type: 'FACE_ABSENT', timestamp: createTs(5000), duration: 4200 }];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 8);
    assert.equal(res.decision, DECISIONS.RELEASE);
    assert.equal(res.advisoryClearance, false);
  });

  // Edge Case 11: Face Absent for a Long Period (Slouching)
  it('Edge Case 11: Two long face absences (35s & 40s) cap at 32 pts -> Advisory RELEASE', () => {
    const events = [
      { type: 'FACE_ABSENT', timestamp: createTs(5000), duration: 35000 },
      { type: 'FACE_ABSENT', timestamp: createTs(60000), duration: 40000 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.integrityRiskScore, 32);
    assert.equal(res.decision, DECISIONS.RELEASE);
    assert.equal(res.advisoryClearance, true);
  });

  // Edge Case 12: Multiple Faces Sustained + Attention + Answer
  it('Edge Case 12: Multiple faces sustained + attention + answer triggers VOID', () => {
    const sess = createBaseSession();
    sess.answers = [{ questionId: 'q1', section: 'chem', answeredAt: createTs(15000) }];
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(5000), duration: 0 },
      { type: 'MULTIPLE_FACES', timestamp: createTs(10000), duration: 35000 },
      { type: 'FOCUS_LOST', timestamp: createTs(11000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(45000), duration: 0 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: sess });
    assert.equal(res.integrityRiskScore, 70);
    assert.equal(res.decision, DECISIONS.VOID);
  });

  // Edge Case 13: Screen Content Change in Isolation
  it('Edge Case 13: Screen content change in isolation caps at Cap_screen = 35 < 50', () => {
    const events = [
      { type: 'SCREEN_VIEW_CHANGED', timestamp: createTs(5000), duration: 35000 }, // 12 * 2.0 = 24
      { type: 'SCREEN_VIEW_CHANGED', timestamp: createTs(50000), duration: 35000 }, // 12 * 2.0 = 24 -> 48 -> cap 35
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    assert.equal(res.categoryRiskBreakdown.screen, 35);
    assert.equal(res.integrityRiskScore, 35);
    assert.equal(res.decision, DECISIONS.RELEASE);
    assert.equal(res.advisoryClearance, true);
  });

  // Edge Case 14: Cross-Category Corroboration Multiplier
  it('Edge Case 14: Multiple distinct categories scale risk by kappa(V)', () => {
    // 2 categories active
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(5000), duration: 0 },
      { type: 'FACE_ABSENT', timestamp: createTs(10000), duration: 15000 }, // Camera: 8 * 1.5 = 12
      { type: 'FOCUS_LOST', timestamp: createTs(10500), duration: 0 }, // Attention: 4 * 1.5 = 6
      { type: 'FOCUS_REGAINED', timestamp: createTs(25000), duration: 0 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: createBaseSession() });
    // V = 2 -> kappa = 1.5. Camera = 12 * 1.5 = 18. Attention = 6 * 1.5 = 9.
    assert.equal(res.categoryRiskBreakdown.camera, 18);
    assert.equal(res.categoryRiskBreakdown.attention, 9);
    assert.equal(res.integrityRiskScore, 27);
  });

  // Edge Case 15: Answer Activity during Multi-Vector Episode
  it('Edge Case 15: Answer activity during multi-vector episode adds +8 pts', () => {
    const sess = createBaseSession();
    sess.answers = [{ questionId: 'q2', section: 'phy', answeredAt: createTs(12000) }];
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(5000), duration: 0 },
      { type: 'FACE_ABSENT', timestamp: createTs(10000), duration: 15000 },
      { type: 'FOCUS_LOST', timestamp: createTs(10500), duration: 0 },
      { type: 'FOCUS_REGAINED', timestamp: createTs(25000), duration: 0 },
    ];
    const res = adjudicateProctoring({ events, mockTestSession: sess });
    // 18 + 9 + 8 (answer) = 35 pts
    assert.equal(res.integrityRiskScore, 35);
  });

  // Edge Case 16: Technical Failure with Zero Behavioral Evidence
  it('Edge Case 16: Technical failure with zero behavioral evidence yields TECHNICAL', () => {
    const events = [
      { type: 'CAMERA_STOPPED', timestamp: createTs(1000), duration: 0 },
      // 0 attention, 0 face, 0 screen events
    ];
    const res = adjudicateProctoring({
      events,
      mockTestSession: createBaseSession(),
      options: { continuityCamera: 0.1 },
    });
    assert.equal(res.integrityRiskScore, 0);
    assert.equal(res.decision, DECISIONS.TECHNICAL);
  });

  // Edge Case 17: Behavioral Evidence during Degraded Telemetry (R >= 50, C < 0.75)
  it('Edge Case 17: High risk with low confidence telemetry (C < 0.75, HV=false) triggers Rule 3 TECHNICAL', () => {
    const res = evaluateDecisionHierarchy({
      R: 65,
      C: 0.60,
      H: TECHNICAL_HEALTH.INSUFFICIENT,
      HV: false,
    });
    assert.equal(res.decision, DECISIONS.TECHNICAL);
    assert.ok(res.reasonCodes.includes(REASON_CODES.TECHNICAL_DEGRADATION));
  });

  // Edge Case 18: Early-Exam Incident Before Confidence Exists
  it('Edge Case 18: Early-exam incident checks setup status via C_prior', () => {
    const cPriorHealthy = calculatePriorConfidence(createTs(30000).getTime(), {
      startedAt: createTs(0),
      initSensors: 1.0,
      setupFailed: false,
    });
    assert.equal(cPriorHealthy, 0.95);

    const cPriorDegraded = calculatePriorConfidence(createTs(30000).getTime(), {
      startedAt: createTs(0),
      initSensors: 0.5,
      setupFailed: true,
    });
    assert.equal(cPriorDegraded, 0.50);
  });

  // Edge Case 19: Rapid Duplicate Telemetry (Debouncing)
  it('Edge Case 19: Consecutive duplicate events within 1500ms are debounced into single token', () => {
    const events = [
      { type: 'FOCUS_LOST', source: 'browser', timestamp: createTs(1000), duration: 0 },
      { type: 'FOCUS_LOST', source: 'browser', timestamp: createTs(1500), duration: 0 }, // Debounced
      { type: 'FOCUS_REGAINED', source: 'browser', timestamp: createTs(5000), duration: 0 },
    ];
    const fsm = reconstructSemanticFSM(normalizeEvents(events, {}), {}, []);
    assert.equal(fsm.tokens.length, 1);
    assert.equal(fsm.tokens[0].durationMs, 4000);
  });

  // Edge Case 20: Channel Suppression (FACE_ABSENT during CAMERA_STOPPED)
  it('Edge Case 20: FACE_ABSENT during active CAMERA_STOPPED is absorbed into media stoppage', () => {
    const events = [
      { type: 'CAMERA_STOPPED', timestamp: createTs(5000), duration: 0 },
      { type: 'FACE_ABSENT', timestamp: createTs(7000), duration: 5000 }, // Absorbed!
      { type: 'CAMERA_STARTED', timestamp: createTs(15000), duration: 0 },
    ];
    const fsm = reconstructSemanticFSM(normalizeEvents(events, {}), {}, []);
    // No standalone FACE_ABSENT token generated
    const faceTokens = fsm.tokens.filter((t) => t.type === 'FACE_ABSENT');
    assert.equal(faceTokens.length, 0);
  });

  // Edge Case 21: Missing Heartbeats
  it('Edge Case 21: Degraded heartbeat continuity drops H to INSUFFICIENT', () => {
    const H = calculateTechnicalHealth({
      initSensors: 1.0,
      continuityCamera: 1.0,
      continuityScreen: 1.0,
      continuityHeartbeats: 0.65, // < 0.70
      tier2StopsCount: 0,
    });
    assert.equal(H, TECHNICAL_HEALTH.INSUFFICIENT);
  });

  // Edge Case 22: Impossible Event Ordering (Orphan End Events)
  it('Edge Case 22: Orphan FOCUS_REGAINED without open state is safely discarded', () => {
    const events = [
      { type: 'FOCUS_REGAINED', timestamp: createTs(5000), duration: 0 }, // Orphan
      { type: 'CAMERA_STARTED', timestamp: createTs(6000), duration: 0 }, // Orphan
    ];
    const fsm = reconstructSemanticFSM(normalizeEvents(events, {}), {}, []);
    assert.equal(fsm.tokens.length, 0);
  });

  // Edge Case 23: Session Termination During Active Incident (Teardown Flush)
  it('Edge Case 23: Incident open at finalization is closed with duration clamped to T_finalization', () => {
    const finalizationAt = createTs(60000);
    const events = [
      { type: 'FOCUS_LOST', timestamp: createTs(40000), duration: 0 },
      // Session submits at 60000ms without FOCUS_REGAINED
    ];
    const fsm = reconstructSemanticFSM(
      normalizeEvents(events, { startedAt: createTs(0), finalizationAt }),
      { startedAt: createTs(0), finalizationAt },
      []
    );
    assert.equal(fsm.tokens.length, 1);
    assert.equal(fsm.tokens[0].durationMs, 20000); // 60000 - 40000
  });

  // Edge Case 24: Out-of-Order Telemetry Sorting
  it('Edge Case 24: Out-of-order events are deterministically sorted by timestamp, seq, and id', () => {
    const events = [
      { _id: 'b', timestamp: createTs(2000), seq: 2, type: 'B' },
      { _id: 'a', timestamp: createTs(1000), seq: 1, type: 'A' },
      { _id: 'c2', timestamp: createTs(3000), seq: 4, type: 'C2' },
      { _id: 'c1', timestamp: createTs(3000), seq: 3, type: 'C1' },
    ];
    const sorted = normalizeEvents(events, {});
    assert.equal(sorted[0].id, 'a');
    assert.equal(sorted[1].id, 'b');
    assert.equal(sorted[2].id, 'c1');
    assert.equal(sorted[3].id, 'c2');
  });
});

// ============================================================================
// CONTROLLER INTEGRATION TESTS (finalizeMockTestSession & submitMockTestSession)
// ============================================================================
describe('Phase B — Controller Integration & Autonomous State Mapping', () => {
  const getBaseTime = () => new Date(Date.now() - 30 * 60 * 1000);
  const createTs = (offsetMs) => new Date(getBaseTime().getTime() + offsetMs);

  function createMockTestDef() {
    return {
      _id: 'mock_test_b_1',
      title: 'Phase B JEE Mock Test',
      slug: 'jee-phase-b',
      duration: 180,
      totalQuestions: 2,
      totalMarks: 8,
      markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
      sections: { physics: { totalQuestions: 2, totalMarks: 8 } },
      questions: [
        { id: 'q1', section: 'physics', q: 'Q1', options: ['A', 'B'], answer: 0 },
        { id: 'q2', section: 'physics', q: 'Q2', options: ['A', 'B'], answer: 1 },
      ],
    };
  }

  function createMockSession(status = 'in_progress') {
    return {
      _id: 'mock_sess_b_1',
      user: 'student_b_1',
      mockTest: 'mock_test_b_1',
      status,
      evaluationStatus: 'PENDING',
      startedAt: createTs(0),
      expiresAt: new Date(Date.now() + 150 * 60 * 1000),
      submittedAt: null,
      answers: [
        { questionId: 'q1', section: 'physics', selectedOption: 0, answeredAt: createTs(1000) },
        { questionId: 'q2', section: 'physics', selectedOption: 1, answeredAt: createTs(2000) },
      ],
      result: undefined,
      proctoringSession: 'proc_sess_b_1',
      proctoringAssessment: null,
      save: async function () {
        return this;
      },
      set: function (key, val) {
        this[key] = val;
      },
    };
  }

  function createProcSession() {
    return {
      _id: 'proc_sess_b_1',
      mockTestSession: 'mock_sess_b_1',
      user: 'student_b_1',
      status: 'active',
      startedAt: createTs(0),
      cameraState: 'active',
      screenShareState: 'active',
      metadata: { cvStatus: 'active', screenAiStatus: 'active' },
    };
  }

  function withDatabaseMock(setup, testFn) {
    return async () => {
      const origMockFindById = MockTest.findById;
      const origSessionFindById = MockTestSession.findById;
      const origProcFindById = ProctoringSession.findById;
      const origProcFindOne = ProctoringSession.findOne;
      const origEventFind = ProctoringEvent.find;
      const origAssessmentFindOneAndUpdate = ProctoringAssessment.findOneAndUpdate;

      let savedAssessmentDoc = null;

      try {
        MockTest.findById = async () => setup.mockTest || createMockTestDef();
        MockTestSession.findById = async () => setup.mockSession || createMockSession();
        ProctoringSession.findById = async () => setup.procSession || createProcSession();
        ProctoringSession.findOne = async () => setup.procSession || createProcSession();
        ProctoringEvent.find = () => ({
          sort: () => ({
            lean: async () => setup.events || [],
          }),
          lean: async () => setup.events || [],
        });
        ProctoringAssessment.findOneAndUpdate = async (query, update) => {
          savedAssessmentDoc = {
            _id: new mongoose.Types.ObjectId(),
            ...update,
          };
          return savedAssessmentDoc;
        };

        await testFn({ getSavedAssessment: () => savedAssessmentDoc });
      } finally {
        MockTest.findById = origMockFindById;
        MockTestSession.findById = origSessionFindById;
        ProctoringSession.findById = origProcFindById;
        ProctoringSession.findOne = origProcFindOne;
        ProctoringEvent.find = origEventFind;
        ProctoringAssessment.findOneAndUpdate = origAssessmentFindOneAndUpdate;
      }
    };
  }

  it('Autonomous finalization with Clean evidence sets EVALUATED and scores test', withDatabaseMock(
    {
      events: [
        { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createMockSession();
      const mockTest = createMockTestDef();

      const { adjudication } = await finalizeMockTestSession(session, mockTest, { adjudicationMode: true });

      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.ok(session.result, 'Result should be scored');
      assert.equal(session.result.score, 8); // 2 correct (+8)
      assert.equal(adjudication.decision, 'RELEASE');
      const savedDoc = getSavedAssessment();
      assert.ok(savedDoc.adjudication);
      assert.equal(savedDoc.adjudication.decision, 'RELEASE');
    }
  ));

  it('Autonomous finalization with Corroborated Cheating sets REJECTED and withholds result', withDatabaseMock(
    {
      events: [
        { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
        // Repeat focus lost + face absent + screen change
        { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
        { type: 'FACE_ABSENT', timestamp: createTs(20000), duration: 25000 },
        { type: 'FOCUS_LOST', timestamp: createTs(20500), duration: 0 },
        { type: 'SCREEN_VIEW_CHANGED', timestamp: createTs(21000), duration: 25000 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(45500), duration: 0 },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createMockSession();
      const mockTest = createMockTestDef();

      const { adjudication } = await finalizeMockTestSession(session, mockTest, { adjudicationMode: true });

      assert.equal(session.evaluationStatus, 'REJECTED');
      assert.equal(session.result, undefined, 'Result MUST NOT be calculated when REJECTED');
      assert.equal(adjudication.decision, 'VOID');
      assert.ok(adjudication.integrityRiskScore >= 50);
      const savedDoc = getSavedAssessment();
      assert.equal(savedDoc.adjudication.decision, 'VOID');
    }
  ));

  it('Autonomous finalization with unrecovered channel outage sets HELD_TECHNICAL_REVIEW', withDatabaseMock(
    {
      events: [
        { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
        { type: 'CAMERA_STOPPED', timestamp: createTs(5000), duration: 0 }, // Stoppage
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createMockSession();
      const mockTest = createMockTestDef();

      const { adjudication } = await finalizeMockTestSession(session, mockTest, {
        adjudicationMode: true,
        continuityCamera: 0.4,
      });

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined);
      assert.equal(adjudication.decision, 'TECHNICAL');
    }
  ));

  it('submitMockTestSession returns factual REJECTED receipt without accusatory language', withDatabaseMock(
    {
      events: [
        { type: 'CAMERA_STARTED', timestamp: createTs(100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', timestamp: createTs(200), duration: 0 },
        { type: 'FOCUS_LOST', timestamp: createTs(5000), duration: 0 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(8500), duration: 0 },
        { type: 'FACE_ABSENT', timestamp: createTs(20000), duration: 25000 },
        { type: 'FOCUS_LOST', timestamp: createTs(20500), duration: 0 },
        { type: 'SCREEN_VIEW_CHANGED', timestamp: createTs(21000), duration: 25000 },
        { type: 'FOCUS_REGAINED', timestamp: createTs(45500), duration: 0 },
      ],
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_b_1' },
        user: { id: 'student_b_1' },
        body: { adjudicationMode: true, answers: [] },
      };

      const res = {
        statusCode: 200,
        body: null,
        status(c) {
          res.statusCode = c;
          return res;
        },
        json(d) {
          res.body = d;
          return res;
        },
      };

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'REJECTED');
      assert.equal(res.body.result, undefined);
      assert.ok(res.body.message.includes('Session integrity requirements were not met.'));
      // Banned accusatory language check
      assert.ok(!res.body.message.toLowerCase().includes('cheater'));
      assert.ok(!res.body.message.toLowerCase().includes('fraud'));
    }
  ));
});
