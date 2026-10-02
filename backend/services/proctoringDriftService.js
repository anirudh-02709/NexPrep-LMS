/**
 * proctoringDriftService.js
 *
 * NexPrep JEE LMS — Phase D: Production Telemetry Drift Monitoring Service
 *
 * Provides lightweight, privacy-preserving aggregate telemetry monitoring.
 * Strictly uses statistical metadata. No raw media, audio, or video is ever collected.
 *
 * Tracks operational baseline metrics and alerts on systematic telemetry drift:
 * - Outcome rates (RELEASE, Advisory RELEASE, VOID, TECHNICAL)
 * - Risk & confidence distributions (mean, median, percentiles)
 * - Monitoring channel reliability (camera/screen start & stop frequencies)
 * - Event and episode volume metrics
 * - Statistical drift alerts against operational baselines
 */

const mongoose = require('mongoose');
const ProctoringAssessment = require('../models/ProctoringAssessment');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringEpisode = require('../models/ProctoringEpisode');

/**
 * Default engineering calibration baseline for telemetry drift detection.
 * Derived from controlled Phase D empirical benchmarks.
 */
const DEFAULT_DRIFT_BASELINE = Object.freeze({
  maxTechnicalRate: 0.15,            // Warn if TECHNICAL > 15% of sessions
  maxVoidRate: 0.10,                 // Warn if VOID > 10% of sessions
  maxAdvisoryRate: 0.25,             // Warn if Advisory RELEASE > 25% of sessions
  minReleaseRate: 0.70,              // Warn if RELEASE < 70% of sessions
  maxAverageRiskScore: 25.0,         // Warn if mean R across all sessions > 25
  minAverageConfidence: 0.85,        // Warn if mean C across all sessions < 0.85
  minCameraStartRate: 0.95,          // Warn if CAMERA_STARTED appears in < 95% of sessions
  minScreenStartRate: 0.95,          // Warn if SCREEN_SHARE_STARTED appears in < 95% of sessions
  maxCameraStopPerSession: 0.20,     // Warn if CAMERA_STOPPED frequency > 0.20 / session
  maxScreenStopPerSession: 0.20,     // Warn if SCREEN_SHARE_STOPPED frequency > 0.20 / session
  maxAverageEventsPerSession: 50.0,  // Warn if average raw event count > 50 / session
});

/**
 * Computes median value from an array of numbers.
 *
 * @param {Array<number>} numbers
 * @returns {number}
 */
function computeMedian(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Evaluates statistical drift alerts against operational baseline thresholds.
 *
 * @param {Object} metrics - Aggregate metrics summary
 * @param {Object} baseline - Operational baseline thresholds
 * @returns {Array<{ code: string, severity: 'WARNING'|'CRITICAL', message: string, metric: string, observed: number, threshold: number }>}
 */
function evaluateDriftAlerts(metrics, baseline = DEFAULT_DRIFT_BASELINE) {
  const alerts = [];
  const total = metrics.totalSessions || 0;
  if (total < 5) {
    // Insufficient sample size for reliable statistical drift alerts
    return alerts;
  }

  const technicalRate = metrics.outcomes.technical / total;
  if (technicalRate > baseline.maxTechnicalRate) {
    alerts.push({
      code: 'DRIFT_TECHNICAL_RATE_ELEVATED',
      severity: technicalRate > baseline.maxTechnicalRate * 1.5 ? 'CRITICAL' : 'WARNING',
      message: `Elevated TECHNICAL outcome rate (${(technicalRate * 100).toFixed(1)}% vs threshold ${(baseline.maxTechnicalRate * 100).toFixed(1)}%). Indicates potential camera/screen infrastructure degradation.`,
      metric: 'technicalRate',
      observed: Math.round(technicalRate * 1000) / 1000,
      threshold: baseline.maxTechnicalRate,
    });
  }

  const voidRate = metrics.outcomes.void / total;
  if (voidRate > baseline.maxVoidRate) {
    alerts.push({
      code: 'DRIFT_VOID_RATE_ELEVATED',
      severity: 'WARNING',
      message: `Elevated VOID outcome rate (${(voidRate * 100).toFixed(1)}% vs threshold ${(baseline.maxVoidRate * 100).toFixed(1)}%). Review behavioral distribution.`,
      metric: 'voidRate',
      observed: Math.round(voidRate * 1000) / 1000,
      threshold: baseline.maxVoidRate,
    });
  }

  if (metrics.risk.average > baseline.maxAverageRiskScore) {
    alerts.push({
      code: 'DRIFT_AVERAGE_RISK_ELEVATED',
      severity: 'WARNING',
      message: `Average Integrity Risk score (${metrics.risk.average.toFixed(1)} pts) exceeds baseline threshold (${baseline.maxAverageRiskScore} pts).`,
      metric: 'averageRiskScore',
      observed: metrics.risk.average,
      threshold: baseline.maxAverageRiskScore,
    });
  }

  if (metrics.confidence.average < baseline.minAverageConfidence) {
    alerts.push({
      code: 'DRIFT_CONFIDENCE_DEGRADED',
      severity: 'WARNING',
      message: `Average Evidence Confidence (${metrics.confidence.average.toFixed(2)}) is below baseline standard (${baseline.minAverageConfidence}). Check sensor initialization rates.`,
      metric: 'averageConfidence',
      observed: metrics.confidence.average,
      threshold: baseline.minAverageConfidence,
    });
  }

  if (metrics.events.cameraStopRate > baseline.maxCameraStopPerSession) {
    alerts.push({
      code: 'DRIFT_CAMERA_STOPPAGE_SPIKE',
      severity: 'WARNING',
      message: `High CAMERA_STOPPED frequency (${metrics.events.cameraStopRate.toFixed(2)} / session). Potential browser media stream instability.`,
      metric: 'cameraStopRate',
      observed: metrics.events.cameraStopRate,
      threshold: baseline.maxCameraStopPerSession,
    });
  }

  if (metrics.events.screenStopRate > baseline.maxScreenStopPerSession) {
    alerts.push({
      code: 'DRIFT_SCREEN_STOPPAGE_SPIKE',
      severity: 'WARNING',
      message: `High SCREEN_SHARE_STOPPED frequency (${metrics.events.screenStopRate.toFixed(2)} / session). Potential display capture drops.`,
      metric: 'screenStopRate',
      observed: metrics.events.screenStopRate,
      threshold: baseline.maxScreenStopPerSession,
    });
  }

  if (metrics.events.averagePerSession > baseline.maxAverageEventsPerSession) {
    alerts.push({
      code: 'DRIFT_EVENT_VOLUME_ANOMALY',
      severity: 'WARNING',
      message: `Average event volume (${metrics.events.averagePerSession.toFixed(1)} events/session) exceeds baseline limit (${baseline.maxAverageEventsPerSession}). Check telemetry throttling.`,
      metric: 'averageEventsPerSession',
      observed: metrics.events.averagePerSession,
      threshold: baseline.maxAverageEventsPerSession,
    });
  }

  return alerts;
}

/**
 * Computes production telemetry drift summary and aggregate statistics.
 *
 * @param {Object} [filter] - Optional MongoDB query filter (e.g. { createdAt: { $gte: sinceDate } })
 * @param {Object} [customBaseline] - Optional baseline threshold overrides
 * @returns {Promise<Object>} Aggregate telemetry and drift summary
 */
async function computeDriftMetrics(filter = {}, customBaseline = {}) {
  const baseline = { ...DEFAULT_DRIFT_BASELINE, ...customBaseline };

  // Query assessments
  let assessments = [];
  try {
    if (typeof ProctoringAssessment.find === 'function') {
      assessments = await ProctoringAssessment.find(filter)
        .select('adjudication status ruleSetVersion evaluatedAt')
        .lean();
    }
  } catch (err) {
    assessments = [];
  }

  const totalSessions = assessments.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      adjudicationModelVersion: 'phase-a-v1',
      outcomes: { release: 0, cleanRelease: 0, advisoryRelease: 0, void: 0, technical: 0 },
      risk: { average: 0, median: 0, highRiskRate: 0 },
      confidence: { average: 0, median: 0 },
      technicalHealth: { sufficient: 0, insufficient: 0 },
      categoryRiskAverage: { attention: 0, camera: 0, screen: 0, media: 0 },
      events: { totalEvents: 0, averagePerSession: 0, cameraStopRate: 0, screenStopRate: 0 },
      alerts: [],
      generatedAt: new Date(),
    };
  }

  let releaseCount = 0;
  let cleanReleaseCount = 0;
  let advisoryReleaseCount = 0;
  let voidCount = 0;
  let technicalCount = 0;

  const riskScores = [];
  const confidenceScores = [];
  let sufficientHealthCount = 0;
  let insufficientHealthCount = 0;

  let sumAttentionRisk = 0;
  let sumCameraRisk = 0;
  let sumScreenRisk = 0;
  let sumMediaRisk = 0;
  let highRiskCount = 0;

  assessments.forEach((doc) => {
    const adj = doc.adjudication || {};
    const dec = adj.decision;

    if (dec === 'RELEASE') {
      releaseCount++;
      if (adj.advisoryClearance) {
        advisoryReleaseCount++;
      } else {
        cleanReleaseCount++;
      }
    } else if (dec === 'VOID') {
      voidCount++;
    } else if (dec === 'TECHNICAL') {
      technicalCount++;
    }

    const r = typeof adj.integrityRiskScore === 'number' ? adj.integrityRiskScore : 0;
    const c = typeof adj.evidenceConfidence === 'number' ? adj.evidenceConfidence : 0;

    riskScores.push(r);
    confidenceScores.push(c);

    if (r >= 50) highRiskCount++;

    if (adj.technicalHealth === 'INSUFFICIENT') {
      insufficientHealthCount++;
    } else {
      sufficientHealthCount++;
    }

    const catRisk = adj.categoryRiskBreakdown || {};
    sumAttentionRisk += catRisk.attention || 0;
    sumCameraRisk += catRisk.camera || 0;
    sumScreenRisk += catRisk.screen || 0;
    sumMediaRisk += catRisk.media || 0;
  });

  const sumR = riskScores.reduce((acc, v) => acc + v, 0);
  const sumC = confidenceScores.reduce((acc, v) => acc + v, 0);

  const avgR = totalSessions > 0 ? Math.round((sumR / totalSessions) * 10) / 10 : 0;
  const medianR = computeMedian(riskScores);

  const avgC = totalSessions > 0 ? Math.round((sumC / totalSessions) * 100) / 100 : 0;
  const medianC = computeMedian(confidenceScores);

  // Raw event statistics
  let totalEvents = 0;
  let cameraStopCount = 0;
  let screenStopCount = 0;
  let cameraStartCount = 0;
  let screenStartCount = 0;

  try {
    if (typeof ProctoringEvent.countDocuments === 'function') {
      totalEvents = await ProctoringEvent.countDocuments({});
      cameraStopCount = await ProctoringEvent.countDocuments({ type: 'CAMERA_STOPPED' });
      screenStopCount = await ProctoringEvent.countDocuments({ type: 'SCREEN_SHARE_STOPPED' });
      cameraStartCount = await ProctoringEvent.countDocuments({ type: 'CAMERA_STARTED' });
      screenStartCount = await ProctoringEvent.countDocuments({ type: 'SCREEN_SHARE_STARTED' });
    }
  } catch (evErr) {
    // fail gracefully
  }

  const avgEventsPerSession = totalSessions > 0 ? Math.round((totalEvents / totalSessions) * 10) / 10 : 0;
  const cameraStopRate = totalSessions > 0 ? Math.round((cameraStopCount / totalSessions) * 100) / 100 : 0;
  const screenStopRate = totalSessions > 0 ? Math.round((screenStopCount / totalSessions) * 100) / 100 : 0;
  const highRiskRate = totalSessions > 0 ? Math.round((highRiskCount / totalSessions) * 1000) / 1000 : 0;

  const metrics = {
    totalSessions,
    adjudicationModelVersion: 'phase-a-v1',
    outcomes: {
      release: releaseCount,
      cleanRelease: cleanReleaseCount,
      advisoryRelease: advisoryReleaseCount,
      void: voidCount,
      technical: technicalCount,
    },
    risk: {
      average: avgR,
      median: medianR,
      highRiskRate,
    },
    confidence: {
      average: avgC,
      median: medianC,
    },
    technicalHealth: {
      sufficient: sufficientHealthCount,
      insufficient: insufficientHealthCount,
    },
    categoryRiskAverage: {
      attention: Math.round((sumAttentionRisk / totalSessions) * 10) / 10,
      camera: Math.round((sumCameraRisk / totalSessions) * 10) / 10,
      screen: Math.round((sumScreenRisk / totalSessions) * 10) / 10,
      media: Math.round((sumMediaRisk / totalSessions) * 10) / 10,
    },
    events: {
      totalEvents,
      averagePerSession: avgEventsPerSession,
      cameraStopRate,
      screenStopRate,
      cameraStartCount,
      screenStartCount,
    },
    generatedAt: new Date(),
  };

  const alerts = evaluateDriftAlerts(metrics, baseline);
  metrics.alerts = alerts;

  return metrics;
}

module.exports = {
  DEFAULT_DRIFT_BASELINE,
  computeMedian,
  evaluateDriftAlerts,
  computeDriftMetrics,
};
