/**
 * webcamCv.js - Client-Side Computer Vision Pipeline for NexPrep JEE LMS.
 *
 * Consumes local webcam video feed and performs on-device face detection
 * and head pose estimation using MediaPipe FaceLandmarker.
 *
 * Strictly adheres to privacy principles:
 * - NO webcam frames are uploaded to any server or cloud API.
 * - NO cheating or suspicion judgements are made.
 * - Emits only objective telemetry observation events via ObservationStateMachine.
 * - Degrades gracefully if MediaPipe assets cannot load.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebcamCv = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INFERENCE_INTERVAL_MS = 150;
  const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  const MEDIAPIPE_MODEL_ASSET =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  class WebcamCvAnalyzer {
    constructor(options = {}) {
      this.videoElement = options.videoElement || null;
      this.onObservation = typeof options.onObservation === 'function' ? options.onObservation : () => {};
      this.onStatusChange = typeof options.onStatusChange === 'function' ? options.onStatusChange : () => {};
      this.sampleIntervalMs = options.sampleIntervalMs || INFERENCE_INTERVAL_MS;

      // Debug mode check (?cv_debug=1 or options.debugMode)
      this.debugMode =
        options.debugMode ??
        (typeof window !== 'undefined' &&
          window.location &&
          new URLSearchParams(window.location.search).get('cv_debug') === '1');

      this.status = 'stopped'; // 'initializing' | 'active' | 'unavailable' | 'stopped'
      this.landmarker = null;
      this.intervalId = null;
      this.isBusy = false;
      this.lastInferenceTimestamp = 0;

      // Initialize pure state machine
      const StateMachineClass =
        (typeof root !== 'undefined' && root.ObservationStateMachine) ||
        (typeof window !== 'undefined' && window.ObservationStateMachine) ||
        (typeof require === 'function' && require('./observationState.js'));

      if (StateMachineClass) {
        this.stateMachine = new StateMachineClass({
          onObservation: (event) => this.onObservation(event),
        });
      } else {
        console.warn('[WebcamCv] ObservationStateMachine class not found on global scope.');
        this.stateMachine = null;
      }
    }

    /**
     * Initializes the MediaPipe FaceLandmarker model and sets status.
     */
    async init() {
      if (this.status === 'active' || this.status === 'initializing') return;

      this.status = 'initializing';
      this.onStatusChange({ status: 'initializing' });

      try {
        const visionModule =
          (typeof window !== 'undefined' && (window.tasksVision || window)) || {};

        if (!visionModule.FilesetResolver || !visionModule.FaceLandmarker) {
          throw new Error('MediaPipe tasks-vision bundle is not loaded.');
        }

        const filesetResolver = await visionModule.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

        this.landmarker = await visionModule.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_MODEL_ASSET,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFacialTransformationMatrixes: true,
        });

        this.status = 'active';
        this.onStatusChange({ status: 'active' });
        console.log('[WebcamCv] FaceLandmarker initialized successfully.');
      } catch (err) {
        console.warn('[WebcamCv] MediaPipe unavailable, graceful degradation active:', err.message || err);
        this.status = 'unavailable';
        this.onStatusChange({ status: 'unavailable', error: err.message || String(err) });
      }
    }

    /**
     * Starts the periodic inference sampling loop.
     */
    async start(videoElement) {
      if (videoElement) {
        this.videoElement = videoElement;
      }

      if (!this.landmarker && this.status !== 'unavailable') {
        await this.init();
      }

      if (this.status !== 'active') {
        return;
      }

      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      this.intervalId = setInterval(() => {
        this._processFrame();
      }, this.sampleIntervalMs);

      if (this.debugMode) {
        this._initDebugHud();
      }
    }

    /**
     * Process a single video frame.
     */
    _processFrame() {
      if (this.isBusy || this.status !== 'active' || !this.landmarker || !this.videoElement) {
        return;
      }

      const video = this.videoElement;

      // Ensure video element has valid dimensions and frame data ready
      if (
        video.readyState < 2 || // HAVE_CURRENT_DATA
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        video.paused ||
        video.ended
      ) {
        return;
      }

      this.isBusy = true;
      const now = performance.now();

      try {
        const results = this.landmarker.detectForVideo(video, now);
        const faceCount = (results.faceLandmarks && results.faceLandmarks.length) || 0;
        const pose = faceCount === 1 ? this._calculatePose(results) : { yaw: 0, pitch: 0 };
        const confidence =
          results.facePresenceScores && results.facePresenceScores.length > 0
            ? results.facePresenceScores[0]
            : 1.0;

        if (this.stateMachine) {
          this.stateMachine.update({
            timestamp: Date.now(),
            faceCount,
            pose,
            confidence,
          });
        }

        if (this.debugMode) {
          this._updateDebugHud({
            faceCount,
            pose,
            confidence,
            state: this.stateMachine ? this.stateMachine.getState() : {},
          });
        }
      } catch (err) {
        // Soft catch during frame inference to prevent breaking the exam
        console.warn('[WebcamCv] Frame inference error:', err.message || err);
      } finally {
        this.isBusy = false;
      }
    }

    /**
     * Extracts head pose (yaw, pitch in degrees) from transformation matrix or facial landmarks.
     */
    _calculatePose(results) {
      let yaw = 0;
      let pitch = 0;

      // 1. Primary: 4x4 Transformation Matrix (Column-Major)
      if (
        results.facialTransformationMatrixes &&
        results.facialTransformationMatrixes.length > 0 &&
        results.facialTransformationMatrixes[0]
      ) {
        const rawMat = results.facialTransformationMatrixes[0];
        const mat = rawMat.data ? rawMat.data : rawMat;

        if (mat && mat.length >= 16) {
          // Pitch: -arcsin(mat[9]) * (180 / PI)
          const pRad = Math.asin(Math.max(-1, Math.min(1, -mat[9])));
          pitch = (pRad * 180) / Math.PI;

          // Yaw: atan2(mat[8], mat[10]) * (180 / PI)
          const yRad = Math.atan2(mat[8], mat[10]);
          yaw = (yRad * 180) / Math.PI;
        }
      } else if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // 2. Fallback: Geometric Landmark Triangulation
        const landmarks = results.faceLandmarks[0];
        if (landmarks && landmarks.length >= 264) {
          const nose = landmarks[1];
          const rightEye = landmarks[33];
          const leftEye = landmarks[263];
          const forehead = landmarks[10];
          const chin = landmarks[152];

          if (nose && rightEye && leftEye) {
            const eyeMidX = (rightEye.x + leftEye.x) / 2;
            const eyeDist = Math.abs(leftEye.x - rightEye.x) || 0.001;
            const yawRatio = (nose.x - eyeMidX) / (eyeDist * 0.5);
            yaw = Math.max(-90, Math.min(90, yawRatio * 45));
          }

          if (nose && forehead && chin) {
            const faceMidY = (forehead.y + chin.y) / 2;
            const faceHeight = Math.abs(chin.y - forehead.y) || 0.001;
            const pitchRatio = (nose.y - faceMidY) / (faceHeight * 0.5);
            pitch = Math.max(-90, Math.min(90, (pitchRatio - 0.1) * 45));
          }
        }
      }

      if (!Number.isFinite(yaw)) yaw = 0;
      if (!Number.isFinite(pitch)) pitch = 0;

      return {
        yaw: Math.round(yaw * 10) / 10,
        pitch: Math.round(pitch * 10) / 10,
      };
    }

    /**
     * Initializes the optional Diagnostic HUD element.
     */
    _initDebugHud() {
      if (typeof document === 'undefined') return;

      let hud = document.getElementById('cv-debug-hud');
      if (!hud) {
        hud = document.createElement('div');
        hud.id = 'cv-debug-hud';
        hud.className = 'cv-debug-hud';
        hud.innerHTML = `
          <div style="font-weight:700; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px; margin-bottom:6px;">
            CV Diagnostic HUD (?cv_debug=1)
          </div>
          <div id="cv-hud-body">Initializing...</div>
        `;
        document.body.appendChild(hud);
      }
      hud.style.display = 'block';
    }

    /**
     * Updates Diagnostic HUD with live metrics.
     */
    _updateDebugHud({ faceCount, pose, confidence, state }) {
      if (typeof document === 'undefined') return;
      const body = document.getElementById('cv-hud-body');
      if (!body) return;

      body.innerHTML = `
        <div>Faces Detected: <strong style="color:${faceCount === 1 ? '#34d399' : '#f87171'}">${faceCount}</strong></div>
        <div>Pose: <strong>Yaw: ${pose.yaw}° | Pitch: ${pose.pitch}°</strong></div>
        <div>State: <strong style="color:#60a5fa">${state.confirmedFaceState || 'unknown'}</strong></div>
        <div>Deviated: <strong>${state.isPoseConfirmed ? 'YES' : 'NO'}</strong></div>
        <div>Confidence: <strong>${Math.round(confidence * 100)}%</strong></div>
      `;
    }

    /**
     * Stops analyzer, clears timers, closes active episodes and frees resources.
     */
    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      if (this.stateMachine) {
        this.stateMachine.stop();
      }

      if (this.landmarker && typeof this.landmarker.close === 'function') {
        try {
          this.landmarker.close();
        } catch (e) {
          // Ignore landmarker close error
        }
        this.landmarker = null;
      }

      const hud = typeof document !== 'undefined' ? document.getElementById('cv-debug-hud') : null;
      if (hud) {
        hud.style.display = 'none';
      }

      this.status = 'stopped';
      this.onStatusChange({ status: 'stopped' });
      console.log('[WebcamCv] Webcam CV pipeline stopped cleanly.');
    }

    getStatus() {
      return {
        status: this.status,
        state: this.stateMachine ? this.stateMachine.getState() : null,
      };
    }
  }

  return {
    createWebcamCvAnalyzer: (options) => new WebcamCvAnalyzer(options),
    WebcamCvAnalyzer,
  };
});
