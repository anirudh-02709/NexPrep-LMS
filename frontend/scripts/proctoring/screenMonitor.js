/**
 * screenMonitor.js - Client-Side Screen Capture Monitoring & Visual Intelligence.
 *
 * Reuses the existing user-selected MediaStream from getDisplayMedia().
 * Analyzes sampled screen frames 100% locally inside the browser.
 *
 * Strictly adheres to privacy principles:
 * - NO screenshots, canvas data URLs, video blobs, or raw frames are uploaded.
 * - NO cloud vision or external AI APIs are used.
 * - NO subjective cheating/suspicion scores or judgments are rendered.
 * - Emits only objective telemetry observations via ScreenObservationStateMachine.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScreenMonitor = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ANALYSIS_INTERVAL_MS = 500;
  const CANVAS_WIDTH = 64;
  const CANVAS_HEIGHT = 48;
  const SIMILARITY_THRESHOLD = 0.75;
  const ANALYSIS_VERSION = 'phase4-v1';

  class ScreenMonitor {
    constructor(options = {}) {
      this.videoElement = options.videoElement || null;
      this.onObservation = typeof options.onObservation === 'function' ? options.onObservation : () => {};
      this.onStatusChange = typeof options.onStatusChange === 'function' ? options.onStatusChange : () => {};
      this.analysisIntervalMs = options.analysisIntervalMs || ANALYSIS_INTERVAL_MS;
      this.similarityThreshold = options.similarityThreshold || SIMILARITY_THRESHOLD;

      // Debug mode check (?screen_debug=1 or ?cv_debug=1)
      this.debugMode =
        options.debugMode ??
        (typeof window !== 'undefined' &&
          window.location &&
          (new URLSearchParams(window.location.search).get('screen_debug') === '1' ||
            new URLSearchParams(window.location.search).get('cv_debug') === '1'));

      this.status = 'stopped'; // 'initializing' | 'active' | 'unavailable' | 'stopped'
      this.stream = null;
      this.videoTrack = null;
      this.intervalId = null;
      this.isBusy = false;
      this.surfaceMetadata = null;

      // Baseline visual signature
      this.baselineSignature = null;
      this.baselineCalibrated = false;

      // In-memory downscale analysis canvas
      this.analysisCanvas = null;
      this.analysisContext = null;

      // Initialize pure state machine
      const StateMachineClass =
        (typeof root !== 'undefined' && root.ScreenObservationStateMachine) ||
        (typeof window !== 'undefined' && window.ScreenObservationStateMachine) ||
        (typeof require === 'function' && require('./screenObservationState.js'));

      if (StateMachineClass) {
        this.stateMachine = new StateMachineClass({
          analysisIntervalMs: this.analysisIntervalMs,
          similarityThreshold: this.similarityThreshold,
          analysisVersion: ANALYSIS_VERSION,
          onObservation: (event) => this.onObservation(event),
        });
      } else {
        console.warn('[ScreenMonitor] ScreenObservationStateMachine class not found on global scope.');
        this.stateMachine = null;
      }
    }

    /**
     * Initializes the in-memory canvas and video element.
     */
    _initResources() {
      if (typeof document === 'undefined') return;

      if (!this.analysisCanvas) {
        this.analysisCanvas = document.createElement('canvas');
        this.analysisCanvas.width = CANVAS_WIDTH;
        this.analysisCanvas.height = CANVAS_HEIGHT;
        this.analysisContext = this.analysisCanvas.getContext('2d', { willReadFrequently: true });
      }

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
      }
    }

    /**
     * Inspects technical display surface metadata from the captured video track.
     */
    _collectSurfaceMetadata(track) {
      if (!track || typeof track.getSettings !== 'function') {
        return {
          displaySurface: 'unknown',
          width: 0,
          height: 0,
          frameRate: 0,
        };
      }

      const settings = track.getSettings() || {};
      const allowedSurfaces = ['browser', 'window', 'monitor'];
      let displaySurface = 'unknown';

      if (settings.displaySurface && allowedSurfaces.includes(settings.displaySurface.toLowerCase())) {
        displaySurface = settings.displaySurface.toLowerCase();
      }

      return {
        displaySurface,
        width: Math.max(0, Math.round(settings.width || 0)),
        height: Math.max(0, Math.round(settings.height || 0)),
        frameRate: Math.max(0, Math.round(settings.frameRate || 0)),
      };
    }

    /**
     * Starts screen monitoring using an existing MediaStream.
     * @param {MediaStream} stream - The active screen MediaStream from getDisplayMedia
     */
    async start(stream) {
      if (!stream || !stream.active) {
        this.status = 'unavailable';
        this.onStatusChange({ status: 'unavailable', error: 'No active screen MediaStream provided.' });
        if (this.stateMachine) {
          this.stateMachine.update({ isAvailable: false, classification: 'UNAVAILABLE' });
        }
        return;
      }

      this.status = 'initializing';
      this.onStatusChange({ status: 'initializing' });
      this._initResources();

      this.stream = stream;
      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0) {
        this.status = 'unavailable';
        this.onStatusChange({ status: 'unavailable', error: 'Stream has no video tracks.' });
        return;
      }

      this.videoTrack = tracks[0];

      // Collect technical surface metadata
      this.surfaceMetadata = this._collectSurfaceMetadata(this.videoTrack);

      // Emit SCREEN_SURFACE_IDENTIFIED with neutral technical metadata
      this.onObservation({
        type: 'SCREEN_SURFACE_IDENTIFIED',
        source: 'screen',
        duration: 0,
        metadata: {
          displaySurface: this.surfaceMetadata.displaySurface,
          width: this.surfaceMetadata.width,
          height: this.surfaceMetadata.height,
          frameRate: this.surfaceMetadata.frameRate,
          analysisVersion: ANALYSIS_VERSION,
        },
      });

      // Bind stream to video element
      if (this.videoElement && this.videoElement.srcObject !== stream) {
        this.videoElement.srcObject = stream;
        try {
          await this.videoElement.play();
        } catch (e) {
          // Play may resolve asynchronously
        }
      }

      // Attach track ended listener
      this.videoTrack.onended = () => {
        console.log('[ScreenMonitor] Screen capture track ended by user.');
        this._handleCaptureTerminated();
      };

      this.status = 'active';
      this.onStatusChange({ status: 'active', surfaceMetadata: this.surfaceMetadata });

      // Start periodic sampling loop
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.intervalId = setInterval(() => {
        this._processFrame();
      }, this.analysisIntervalMs);

      if (this.debugMode) {
        this._initDebugHud();
      }
    }

    _handleCaptureTerminated() {
      if (this.status === 'stopped') return;

      this.status = 'unavailable';
      this.onStatusChange({ status: 'unavailable', error: 'Capture track ended.' });

      if (this.stateMachine) {
        this.stateMachine.update({
          timestamp: Date.now(),
          isAvailable: false,
          classification: 'UNAVAILABLE',
        });
      }

      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    /**
     * Extracts coarse visual feature vector from downscaled canvas.
     */
    _extractSignature(ctx) {
      const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const data = imgData.data;
      const totalPixels = CANVAS_WIDTH * CANVAS_HEIGHT;

      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let totalLum = 0;

      // 4 Coarse Spatial Regions corresponding to NexPrep UI geometry:
      // Region 1: Top 15% (Header bar: title, section tabs, timer)
      // Region 2: Left 70%, 15%-85% vertical (Question panel & options)
      // Region 3: Left 70%, 85%-100% vertical (Action bar)
      // Region 4: Right 30%, 15%-100% vertical (Question palette panel)
      let r1Lum = 0, r1Count = 0;
      let r2Lum = 0, r2Count = 0;
      let r3Lum = 0, r3Count = 0;
      let r4Lum = 0, r4Count = 0;

      const ySplitHeader = Math.floor(CANVAS_HEIGHT * 0.15);
      const ySplitAction = Math.floor(CANVAS_HEIGHT * 0.85);
      const xSplitPalette = Math.floor(CANVAS_WIDTH * 0.70);

      for (let y = 0; y < CANVAS_HEIGHT; y++) {
        for (let x = 0; x < CANVAS_WIDTH; x++) {
          const idx = (y * CANVAS_WIDTH + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Standard ITU-R BT.601 perceptual luminance normalized to 0..1
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

          totalR += r;
          totalG += g;
          totalB += b;
          totalLum += lum;

          if (y < ySplitHeader) {
            r1Lum += lum;
            r1Count++;
          } else if (x >= xSplitPalette) {
            r4Lum += lum;
            r4Count++;
          } else if (y >= ySplitAction) {
            r3Lum += lum;
            r3Count++;
          } else {
            r2Lum += lum;
            r2Count++;
          }
        }
      }

      const meanLum = totalLum / totalPixels;
      const meanR = totalR / (totalPixels * 255);
      const meanG = totalG / (totalPixels * 255);
      const meanB = totalB / (totalPixels * 255);

      return {
        meanLum,
        regions: [
          r1Count > 0 ? r1Lum / r1Count : 0,
          r2Count > 0 ? r2Lum / r2Count : 0,
          r3Count > 0 ? r3Lum / r3Count : 0,
          r4Count > 0 ? r4Lum / r4Count : 0,
        ],
        color: [meanR, meanG, meanB],
        aspectRatio: CANVAS_WIDTH / CANVAS_HEIGHT,
      };
    }

    /**
     * Computes similarity between current frame signature and expected baseline.
     */
    _computeSimilarity(sigA, sigB) {
      if (!sigA || !sigB) return 1.0;

      // 1. Regional luminance difference (0..1)
      let regionDiff = 0;
      for (let i = 0; i < 4; i++) {
        regionDiff += Math.abs(sigA.regions[i] - sigB.regions[i]);
      }
      const regionalSim = Math.max(0, 1 - regionDiff / 4);

      // 2. Coarse color balance difference (0..1)
      const colorDiff =
        (Math.abs(sigA.color[0] - sigB.color[0]) +
          Math.abs(sigA.color[1] - sigB.color[1]) +
          Math.abs(sigA.color[2] - sigB.color[2])) /
        3;
      const colorSim = Math.max(0, 1 - colorDiff);

      // Combined deterministic metric
      const sim = 0.6 * regionalSim + 0.4 * colorSim;
      return Math.max(0, Math.min(1, sim));
    }

    /**
     * Process a single video frame.
     */
    _processFrame() {
      if (this.isBusy || this.status !== 'active' || !this.videoElement || !this.analysisContext) {
        return;
      }

      const video = this.videoElement;

      // Ensure video element has valid frames ready
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

      try {
        const ctx = this.analysisContext;
        ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const currentSig = this._extractSignature(ctx);

        // Discard raw canvas pixel data by clearing
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Calibrate baseline signature on first valid frame (rejecting blank / zero-luminance unrendered frames)
        if (!this.baselineCalibrated && currentSig && currentSig.meanLum >= 0.02) {
          this.baselineSignature = currentSig;
          this.baselineCalibrated = true;
        }

        const similarity = this.baselineCalibrated
          ? this._computeSimilarity(currentSig, this.baselineSignature)
          : 1.0;
        const classification = similarity >= this.similarityThreshold ? 'EXPECTED_EXAM_VIEW' : 'CHANGED';

        if (this.stateMachine) {
          this.stateMachine.update({
            timestamp: Date.now(),
            similarity,
            classification,
            isAvailable: true,
          });
        }

        if (this.debugMode) {
          this._updateDebugHud({
            similarity,
            classification,
            state: this.stateMachine ? this.stateMachine.getState() : {},
          });
        }
      } catch (err) {
        console.warn('[ScreenMonitor] Frame analysis error:', err.message || err);
      } finally {
        this.isBusy = false;
      }
    }

    _initDebugHud() {
      if (typeof document === 'undefined') return;

      let hud = document.getElementById('screen-debug-hud');
      if (!hud) {
        hud = document.createElement('div');
        hud.id = 'screen-debug-hud';
        hud.className = 'screen-debug-hud';
        hud.innerHTML = `
          <div style="font-weight:700; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px; margin-bottom:6px;">
            Screen Diagnostic HUD (?screen_debug=1)
          </div>
          <div id="screen-hud-body">Initializing...</div>
        `;
        document.body.appendChild(hud);
      }
      hud.style.display = 'block';
    }

    _updateDebugHud({ similarity, classification, state }) {
      if (typeof document === 'undefined') return;
      const body = document.getElementById('screen-hud-body');
      if (!body) return;

      const isExp = classification === 'EXPECTED_EXAM_VIEW';
      body.innerHTML = `
        <div>Surface: <strong>${this.surfaceMetadata?.displaySurface || 'unknown'}</strong></div>
        <div>Resolution: <strong>${this.surfaceMetadata?.width || 0}x${this.surfaceMetadata?.height || 0}</strong></div>
        <div>Similarity: <strong style="color:${isExp ? '#34d399' : '#f87171'}">${Math.round(similarity * 100)}%</strong></div>
        <div>Class: <strong>${classification}</strong></div>
        <div>State: <strong style="color:#60a5fa">${state.currentState || 'UNKNOWN'}</strong></div>
        <div>Changed: <strong>${state.isChangeConfirmed ? 'YES (Active)' : 'NO'}</strong></div>
      `;
    }

    /**
     * Stops the screen monitor, closes any active change episodes, and cleans up resources.
     */
    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      if (this.stateMachine) {
        this.stateMachine.stop();
      }

      if (this.videoTrack) {
        this.videoTrack.onended = null;
      }

      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
      }

      const hud = typeof document !== 'undefined' ? document.getElementById('screen-debug-hud') : null;
      if (hud) {
        hud.style.display = 'none';
      }

      this.status = 'stopped';
      this.onStatusChange({ status: 'stopped' });
      console.log('[ScreenMonitor] Screen monitor stopped cleanly.');
    }

    /**
     * Explicitly triggers baseline recalibration on the next valid frame.
     */
    recalibrateBaseline() {
      this.baselineSignature = null;
      this.baselineCalibrated = false;
      console.log('[ScreenMonitor] Baseline recalibration requested.');
    }

    getStatus() {
      return {
        status: this.status,
        surfaceMetadata: this.surfaceMetadata,
        state: this.stateMachine ? this.stateMachine.getState() : null,
      };
    }
  }

  return {
    createScreenMonitor: (options) => new ScreenMonitor(options),
    ScreenMonitor,
  };
});
