/**
 * observationState.js - Pure state machine for computer-vision observation stabilization.
 *
 * Implements hysteresis thresholds to prevent flickering and filter transient noise:
 * - FACE_PRESENT: single face confirmed after 300ms continuous presence.
 * - FACE_ABSENT: absence episode confirmed after 1000ms, emitted with duration upon reappearance or teardown.
 * - MULTIPLE_FACES: multiple faces episode confirmed after 750ms, emitted with duration and maxFacesObserved.
 * - HEAD_POSE_DEVIATION: head pose deviation episode confirmed after 1000ms, emitted with duration and max angles.
 *
 * Fully decoupled from DOM/window for 100% deterministic unit testing in Node.js.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // CommonJS / Node.js
    module.exports = factory();
  } else {
    // Browser global
    root.ObservationStateMachine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class ObservationStateMachine {
    constructor(options = {}) {
      this.presentConfirmationMs = options.presentConfirmationMs ?? 300;
      this.absentConfirmationMs = options.absentConfirmationMs ?? 1000;
      this.multipleFaceConfirmationMs = options.multipleFaceConfirmationMs ?? 750;
      this.poseDeviationConfirmationMs = options.poseDeviationConfirmationMs ?? 1000;
      this.yawThresholdDeg = options.yawThresholdDeg ?? 28;
      this.pitchThresholdDeg = options.pitchThresholdDeg ?? 22;
      this.onObservation = typeof options.onObservation === 'function' ? options.onObservation : () => {};

      this.reset();
    }

    /**
     * Resets all internal state and timers without emitting any events.
     */
    reset() {
      // Confirmed states: 'unknown' | 'present' | 'absent' | 'multiple'
      this.confirmedFaceState = 'unknown';

      // Presence candidate
      this.presentCandidateStartTime = null;

      // Absence candidate & episode
      this.absentCandidateStartTime = null;
      this.isAbsentConfirmed = false;
      this.absentStartTime = null;

      // Multiple faces candidate & episode
      this.multipleCandidateStartTime = null;
      this.isMultipleConfirmed = false;
      this.multipleStartTime = null;
      this.multipleMaxFaces = 0;

      // Head pose candidate & episode
      this.poseCandidateStartTime = null;
      this.isPoseConfirmed = false;
      this.poseStartTime = null;
      this.poseMaxYaw = 0;
      this.poseMaxPitch = 0;

      // Latest raw values
      this.currentFaceCount = 0;
      this.currentPose = { yaw: 0, pitch: 0 };
    }

    /**
     * Process a single inference sample / frame.
     * @param {Object} sample
     * @param {number} [sample.timestamp] - Current timestamp in ms (defaults to Date.now())
     * @param {number} [sample.faceCount=0] - Number of detected faces
     * @param {Object} [sample.pose] - Head pose angles { yaw, pitch } in degrees
     * @param {number} [sample.confidence=1.0] - Detection confidence score
     */
    update(sample = {}) {
      const timestamp = typeof sample.timestamp === 'number' ? sample.timestamp : Date.now();
      const faceCount = typeof sample.faceCount === 'number' ? sample.faceCount : 0;
      const pose = sample.pose || { yaw: 0, pitch: 0 };
      const yaw = typeof pose.yaw === 'number' && Number.isFinite(pose.yaw) ? pose.yaw : 0;
      const pitch = typeof pose.pitch === 'number' && Number.isFinite(pose.pitch) ? pose.pitch : 0;
      const confidence = typeof sample.confidence === 'number' ? sample.confidence : 1.0;

      this.currentFaceCount = faceCount;
      this.currentPose = { yaw, pitch };

      // ─── 1. Face Count Analysis ───────────────────────────────────
      if (faceCount === 0) {
        // Face is absent
        this._handleFaceAbsentSample(timestamp);
      } else if (faceCount === 1) {
        // Single face
        this._handleSingleFaceSample(timestamp, confidence);
      } else {
        // Multiple faces (> 1)
        this._handleMultipleFacesSample(timestamp, faceCount);
      }

      // ─── 2. Head Pose Analysis ────────────────────────────────────
      // Head pose is only evaluated when exactly 1 face is visible
      if (faceCount === 1) {
        this._handlePoseSample(timestamp, yaw, pitch);
      } else {
        // If face is absent or multiple, pose is reset/neutralized
        this._closePoseEpisodeIfActive(timestamp);
        this.poseCandidateStartTime = null;
      }
    }

    _handleFaceAbsentSample(timestamp) {
      // If we were tracking multiple faces, close that episode
      this._closeMultipleEpisodeIfActive(timestamp);
      this.multipleCandidateStartTime = null;

      // Reset present candidate
      this.presentCandidateStartTime = null;

      if (this.isAbsentConfirmed) {
        // Already confirmed absent, episode is actively extending
        return;
      }

      if (this.absentCandidateStartTime === null) {
        this.absentCandidateStartTime = timestamp;
      }

      const elapsed = timestamp - this.absentCandidateStartTime;
      if (elapsed >= this.absentConfirmationMs) {
        // Confirmed absence episode starts
        this.isAbsentConfirmed = true;
        this.absentStartTime = this.absentCandidateStartTime;
        this.confirmedFaceState = 'absent';
      }
    }

    _handleSingleFaceSample(timestamp, confidence) {
      // If returning from confirmed absence, close the absence episode
      this._closeAbsentEpisodeIfActive(timestamp);
      this.absentCandidateStartTime = null;

      // If returning from confirmed multiple faces, close that episode
      this._closeMultipleEpisodeIfActive(timestamp);
      this.multipleCandidateStartTime = null;

      if (this.confirmedFaceState !== 'present') {
        if (this.presentCandidateStartTime === null) {
          this.presentCandidateStartTime = timestamp;
        }

        const elapsed = timestamp - this.presentCandidateStartTime;
        if (elapsed >= this.presentConfirmationMs) {
          this.confirmedFaceState = 'present';
          this.onObservation({
            type: 'FACE_PRESENT',
            source: 'webcam',
            duration: 0,
            metadata: {
              confidence: Math.round(confidence * 100) / 100,
            },
          });
        }
      }
    }

    _handleMultipleFacesSample(timestamp, faceCount) {
      // If returning from confirmed absence, close the absence episode
      this._closeAbsentEpisodeIfActive(timestamp);
      this.absentCandidateStartTime = null;

      // Reset present candidate
      this.presentCandidateStartTime = null;

      if (this.isMultipleConfirmed) {
        // Track maximum faces seen during this sustained episode
        if (faceCount > this.multipleMaxFaces) {
          this.multipleMaxFaces = faceCount;
        }
        return;
      }

      if (this.multipleCandidateStartTime === null) {
        this.multipleCandidateStartTime = timestamp;
        this.multipleMaxFaces = faceCount;
      } else {
        if (faceCount > this.multipleMaxFaces) {
          this.multipleMaxFaces = faceCount;
        }
      }

      const elapsed = timestamp - this.multipleCandidateStartTime;
      if (elapsed >= this.multipleFaceConfirmationMs) {
        this.isMultipleConfirmed = true;
        this.multipleStartTime = this.multipleCandidateStartTime;
        this.confirmedFaceState = 'multiple';
      }
    }

    _handlePoseSample(timestamp, yaw, pitch) {
      const isDeviated = Math.abs(yaw) > this.yawThresholdDeg || Math.abs(pitch) > this.pitchThresholdDeg;

      if (isDeviated) {
        if (this.poseCandidateStartTime === null) {
          this.poseCandidateStartTime = timestamp;
          this.poseMaxYaw = yaw;
          this.poseMaxPitch = pitch;
        } else {
          if (Math.abs(yaw) > Math.abs(this.poseMaxYaw)) this.poseMaxYaw = yaw;
          if (Math.abs(pitch) > Math.abs(this.poseMaxPitch)) this.poseMaxPitch = pitch;
        }

        if (!this.isPoseConfirmed) {
          const elapsed = timestamp - this.poseCandidateStartTime;
          if (elapsed >= this.poseDeviationConfirmationMs) {
            this.isPoseConfirmed = true;
            this.poseStartTime = this.poseCandidateStartTime;
          }
        }
      } else {
        // Returned to neutral pose
        this._closePoseEpisodeIfActive(timestamp);
        this.poseCandidateStartTime = null;
      }
    }

    _closeAbsentEpisodeIfActive(timestamp) {
      if (this.isAbsentConfirmed && this.absentStartTime !== null) {
        const duration = Math.max(0, Math.round(timestamp - this.absentStartTime));
        this.onObservation({
          type: 'FACE_ABSENT',
          source: 'webcam',
          duration,
          metadata: {
            confirmedDurationMs: duration,
          },
        });
      }
      this.isAbsentConfirmed = false;
      this.absentStartTime = null;
    }

    _closeMultipleEpisodeIfActive(timestamp) {
      if (this.isMultipleConfirmed && this.multipleStartTime !== null) {
        const duration = Math.max(0, Math.round(timestamp - this.multipleStartTime));
        this.onObservation({
          type: 'MULTIPLE_FACES',
          source: 'webcam',
          duration,
          metadata: {
            maxFacesObserved: this.multipleMaxFaces,
            confirmedDurationMs: duration,
          },
        });
      }
      this.isMultipleConfirmed = false;
      this.multipleStartTime = null;
      this.multipleMaxFaces = 0;
    }

    _closePoseEpisodeIfActive(timestamp) {
      if (this.isPoseConfirmed && this.poseStartTime !== null) {
        const duration = Math.max(0, Math.round(timestamp - this.poseStartTime));
        let direction = 'neutral';
        if (Math.abs(this.poseMaxYaw) >= Math.abs(this.poseMaxPitch)) {
          direction = this.poseMaxYaw > 0 ? 'right' : 'left';
        } else {
          direction = this.poseMaxPitch > 0 ? 'down' : 'up';
        }

        this.onObservation({
          type: 'HEAD_POSE_DEVIATION',
          source: 'webcam',
          duration,
          metadata: {
            maxYaw: Math.round(this.poseMaxYaw * 10) / 10,
            maxPitch: Math.round(this.poseMaxPitch * 10) / 10,
            direction,
            confirmedDurationMs: duration,
          },
        });
      }
      this.isPoseConfirmed = false;
      this.poseStartTime = null;
      this.poseMaxYaw = 0;
      this.poseMaxPitch = 0;
    }

    /**
     * Stop the state machine, closing any open/sustained episodes and emitting their events.
     * @param {number} [timestamp] - Current timestamp in ms (defaults to Date.now())
     */
    stop(timestamp) {
      const ts = typeof timestamp === 'number' ? timestamp : Date.now();

      this._closeAbsentEpisodeIfActive(ts);
      this._closeMultipleEpisodeIfActive(ts);
      this._closePoseEpisodeIfActive(ts);

      this.reset();
    }

    /**
     * Returns a read-only snapshot of current internal state.
     */
    getState() {
      return {
        confirmedFaceState: this.confirmedFaceState,
        isAbsentConfirmed: this.isAbsentConfirmed,
        isMultipleConfirmed: this.isMultipleConfirmed,
        isPoseConfirmed: this.isPoseConfirmed,
        currentFaceCount: this.currentFaceCount,
        currentPose: { ...this.currentPose },
      };
    }
  }

  return ObservationStateMachine;
});
