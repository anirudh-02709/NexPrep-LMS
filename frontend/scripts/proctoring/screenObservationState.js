/**
 * screenObservationState.js - Pure state machine for screen-capture observation stabilization.
 *
 * Implements temporal hysteresis thresholds to filter transient noise and track continuous episodes:
 * - SCREEN_VIEW_STABLE: single event emitted once upon establishing stable expected exam view (1000ms).
 * - SCREEN_VIEW_CHANGED: visual change episode confirmed after 1500ms, emitted with duration upon return or teardown.
 * - SCREEN_VIEW_UNAVAILABLE: emitted once when screen capture or frame analysis is lost.
 *
 * Fully decoupled from DOM/window for 100% deterministic unit testing in Node.js.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // CommonJS / Node.js
    module.exports = factory();
  } else {
    // Browser global
    root.ScreenObservationStateMachine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_CONFIG = {
    analysisIntervalMs: 500,
    stableConfirmationMs: 1000,
    changeConfirmationMs: 1500,
    similarityThreshold: 0.75,
    analysisVersion: 'phase4-v1',
  };

  class ScreenObservationStateMachine {
    constructor(options = {}) {
      this.analysisIntervalMs = options.analysisIntervalMs ?? DEFAULT_CONFIG.analysisIntervalMs;
      this.stableConfirmationMs = options.stableConfirmationMs ?? DEFAULT_CONFIG.stableConfirmationMs;
      this.changeConfirmationMs = options.changeConfirmationMs ?? DEFAULT_CONFIG.changeConfirmationMs;
      this.similarityThreshold = options.similarityThreshold ?? DEFAULT_CONFIG.similarityThreshold;
      this.analysisVersion = options.analysisVersion ?? DEFAULT_CONFIG.analysisVersion;
      this.onObservation = typeof options.onObservation === 'function' ? options.onObservation : () => {};

      this.reset();
    }

    /**
     * Resets all internal state and timers without emitting any events.
     */
    reset() {
      // States: 'UNKNOWN' | 'EXPECTED_EXAM_VIEW' | 'SCREEN_VIEW_CHANGED' | 'SCREEN_UNAVAILABLE'
      this.currentState = 'UNKNOWN';
      this.isStopped = false;

      // Stability tracking
      this.stableCandidateStartTime = null;
      this.isStableEmitted = false;

      // Change episode tracking
      this.changeCandidateStartTime = null;
      this.isChangeConfirmed = false;
      this.changeStartTime = null;
      this.minSimilarityObserved = 1.0;

      // Latest values
      this.currentSimilarity = 1.0;
      this.currentClassification = 'UNKNOWN';
    }

    /**
     * Process a single screen inference sample.
     * @param {Object} sample
     * @param {number} [sample.timestamp] - Current timestamp in ms (defaults to Date.now())
     * @param {number} [sample.similarity=1.0] - Similarity metric (0..1)
     * @param {string} [sample.classification='EXPECTED_EXAM_VIEW'] - Visual classification
     * @param {boolean} [sample.isAvailable=true] - Whether screen capture is active
     */
    update(sample = {}) {
      if (this.isStopped) {
        return;
      }

      const timestamp = typeof sample.timestamp === 'number' ? sample.timestamp : Date.now();
      const isAvailable = sample.isAvailable !== false && sample.classification !== 'UNAVAILABLE';
      const similarity =
        typeof sample.similarity === 'number' && Number.isFinite(sample.similarity)
          ? Math.max(0, Math.min(1, sample.similarity))
          : 1.0;
      const classification = sample.classification || (similarity >= this.similarityThreshold ? 'EXPECTED_EXAM_VIEW' : 'CHANGED');

      this.currentSimilarity = similarity;
      this.currentClassification = classification;

      // ─── 1. Handle Screen Unavailable ─────────────────────────────
      if (!isAvailable) {
        this._handleUnavailableSample(timestamp);
        return;
      }

      // ─── 2. Handle Expected Exam View ─────────────────────────────
      const isExpected = classification === 'EXPECTED_EXAM_VIEW' && similarity >= this.similarityThreshold;

      if (isExpected) {
        this._handleExpectedSample(timestamp, similarity);
      } else {
        this._handleChangedSample(timestamp, similarity);
      }
    }

    _handleExpectedSample(timestamp, similarity) {
      // If returning from a confirmed change episode, close the episode
      this._closeChangeEpisodeIfActive(timestamp);
      this.changeCandidateStartTime = null;

      if (this.currentState !== 'EXPECTED_EXAM_VIEW') {
        if (this.stableCandidateStartTime === null) {
          this.stableCandidateStartTime = timestamp;
        }

        const elapsed = timestamp - this.stableCandidateStartTime;
        if (elapsed >= this.stableConfirmationMs) {
          this.currentState = 'EXPECTED_EXAM_VIEW';

          if (!this.isStableEmitted) {
            this.isStableEmitted = true;
            this.onObservation({
              type: 'SCREEN_VIEW_STABLE',
              source: 'screen',
              duration: 0,
              metadata: {
                similarity: Math.round(similarity * 100) / 100,
                classification: 'EXPECTED_EXAM_VIEW',
                analysisVersion: this.analysisVersion,
              },
            });
          }
        }
      }
    }

    _handleChangedSample(timestamp, similarity) {
      // Invalidate stable candidate when deviations occur
      this.stableCandidateStartTime = null;
      this.isStableEmitted = false;

      if (this.isChangeConfirmed) {
        // Track the lowest similarity seen during this sustained episode
        if (similarity < this.minSimilarityObserved) {
          this.minSimilarityObserved = similarity;
        }
        return;
      }

      if (this.changeCandidateStartTime === null) {
        this.changeCandidateStartTime = timestamp;
        this.minSimilarityObserved = similarity;
      } else {
        if (similarity < this.minSimilarityObserved) {
          this.minSimilarityObserved = similarity;
        }
      }

      const elapsed = timestamp - this.changeCandidateStartTime;
      if (elapsed >= this.changeConfirmationMs) {
        this.isChangeConfirmed = true;
        this.changeStartTime = this.changeCandidateStartTime;
        this.currentState = 'SCREEN_VIEW_CHANGED';
      }
    }

    _handleUnavailableSample(timestamp) {
      // If a change episode was ongoing, close it
      this._closeChangeEpisodeIfActive(timestamp);
      this.changeCandidateStartTime = null;
      this.stableCandidateStartTime = null;
      this.isStableEmitted = false;

      if (this.currentState !== 'SCREEN_UNAVAILABLE') {
        this.currentState = 'SCREEN_UNAVAILABLE';
        this.onObservation({
          type: 'SCREEN_VIEW_UNAVAILABLE',
          source: 'screen',
          duration: 0,
          metadata: {
            classification: 'UNAVAILABLE',
            analysisVersion: this.analysisVersion,
          },
        });
      }
    }

    _closeChangeEpisodeIfActive(timestamp) {
      if (this.isChangeConfirmed && this.changeStartTime !== null) {
        const duration = Math.max(0, Math.round(timestamp - this.changeStartTime));
        this.onObservation({
          type: 'SCREEN_VIEW_CHANGED',
          source: 'screen',
          duration,
          metadata: {
            similarity: Math.round(this.minSimilarityObserved * 100) / 100,
            classification: 'CHANGED',
            analysisVersion: this.analysisVersion,
            confirmedDurationMs: duration,
          },
        });
      }
      this.isChangeConfirmed = false;
      this.changeStartTime = null;
      this.minSimilarityObserved = 1.0;
    }

    /**
     * Stop the state machine, closing any open change episodes and preventing future updates.
     * @param {number} [timestamp] - Current timestamp in ms (defaults to Date.now())
     */
    stop(timestamp) {
      const ts = typeof timestamp === 'number' ? timestamp : Date.now();
      this._closeChangeEpisodeIfActive(ts);
      this.isStopped = true;
      this.changeCandidateStartTime = null;
      this.stableCandidateStartTime = null;
    }

    /**
     * Returns a read-only snapshot of current internal state.
     */
    getState() {
      return {
        currentState: this.currentState,
        isChangeConfirmed: this.isChangeConfirmed,
        isStopped: this.isStopped,
        currentSimilarity: this.currentSimilarity,
        currentClassification: this.currentClassification,
        minSimilarityObserved: this.minSimilarityObserved,
      };
    }
  }

  return ScreenObservationStateMachine;
});
