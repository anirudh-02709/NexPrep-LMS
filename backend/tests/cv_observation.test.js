const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ObservationStateMachine = require('../../frontend/scripts/proctoring/observationState.js');

describe('Webcam Computer Vision Observation State Machine (Phase 3)', () => {
  // ─── Scenario 1: Continuous Single Face ─────────────────────────
  it('1. 1 face continuously produces exactly 1 FACE_PRESENT event after 300ms, no spurious events', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      presentConfirmationMs: 300,
      absentConfirmationMs: 1000,
      multipleFaceConfirmationMs: 750,
      poseDeviationConfirmationMs: 1000,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    // t=0: initial frame
    sm.update({ timestamp: 1000, faceCount: 1, pose: { yaw: 2, pitch: 1 }, confidence: 0.98 });
    assert.equal(emittedEvents.length, 0, 'Candidate present must not emit immediately');

    // t=150: candidate progressing
    sm.update({ timestamp: 1150, faceCount: 1, pose: { yaw: 1, pitch: 0 }, confidence: 0.99 });
    assert.equal(emittedEvents.length, 0);

    // t=300: confirmation threshold reached
    sm.update({ timestamp: 1300, faceCount: 1, pose: { yaw: 0, pitch: 0 }, confidence: 0.97 });
    assert.equal(emittedEvents.length, 1, 'Should emit FACE_PRESENT once confirmed');
    assert.equal(emittedEvents[0].type, 'FACE_PRESENT');
    assert.equal(emittedEvents[0].source, 'webcam');
    assert.equal(emittedEvents[0].duration, 0);
    assert.equal(emittedEvents[0].metadata.confidence, 0.97);

    // Further continuous frames should NOT duplicate FACE_PRESENT
    for (let t = 1450; t <= 3000; t += 150) {
      sm.update({ timestamp: t, faceCount: 1, pose: { yaw: 2, pitch: 3 }, confidence: 0.98 });
    }
    assert.equal(emittedEvents.length, 1, 'Continuous single face must not emit duplicate events');
  });

  // ─── Scenario 2: Transient Absence Filtered Out ─────────────────
  it('2. Transient absence (< 1000ms) is filtered out with no FACE_ABSENT event emitted', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      presentConfirmationMs: 300,
      absentConfirmationMs: 1000,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    // Establish face present at t=1000..1300
    sm.update({ timestamp: 1000, faceCount: 1 });
    sm.update({ timestamp: 1300, faceCount: 1 });
    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0].type, 'FACE_PRESENT');

    // Face absent for 700ms (t=1400 to t=2100)
    sm.update({ timestamp: 1400, faceCount: 0 });
    sm.update({ timestamp: 1600, faceCount: 0 });
    sm.update({ timestamp: 2000, faceCount: 0 });

    // Face reappears at t=2100 (elapsed absence: 700ms < 1000ms threshold)
    sm.update({ timestamp: 2100, faceCount: 1 });

    // Verify no FACE_ABSENT was emitted
    const absentEvents = emittedEvents.filter((e) => e.type === 'FACE_ABSENT');
    assert.equal(absentEvents.length, 0, 'Transient absence must be filtered out');
  });

  // ─── Scenario 3: Sustained Absence Episode ──────────────────────
  it('3. Sustained absence (2000ms) followed by reappearance emits FACE_ABSENT with exact episode duration', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      presentConfirmationMs: 300,
      absentConfirmationMs: 1000,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    // Establish initial face
    sm.update({ timestamp: 1000, faceCount: 1 });
    sm.update({ timestamp: 1300, faceCount: 1 });

    // Absence begins at t=1500
    sm.update({ timestamp: 1500, faceCount: 0 });
    sm.update({ timestamp: 2000, faceCount: 0 });
    sm.update({ timestamp: 2500, faceCount: 0 }); // At t=2500 (1000ms elapsed), absence is confirmed

    // Absence continues until t=3500
    sm.update({ timestamp: 3000, faceCount: 0 });
    sm.update({ timestamp: 3500, faceCount: 0 });

    // Face returns at t=3500 (total absence: 3500 - 1500 = 2000ms)
    sm.update({ timestamp: 3500, faceCount: 1 });

    const absentEvents = emittedEvents.filter((e) => e.type === 'FACE_ABSENT');
    assert.equal(absentEvents.length, 1, 'Exactly one FACE_ABSENT event must be emitted');
    assert.equal(absentEvents[0].duration, 2000);
    assert.equal(absentEvents[0].source, 'webcam');
    assert.equal(absentEvents[0].metadata.confirmedDurationMs, 2000);

    // After 300ms continuous presence, FACE_PRESENT should re-trigger
    sm.update({ timestamp: 3800, faceCount: 1 });
    const presentEvents = emittedEvents.filter((e) => e.type === 'FACE_PRESENT');
    assert.equal(presentEvents.length, 2, 'FACE_PRESENT should be re-emitted after face returns');
  });

  // ─── Scenario 4: Transient Multiple Faces Filtered Out ──────────
  it('4. Transient multiple faces (< 750ms) is filtered out without MULTIPLE_FACES event', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      multipleFaceConfirmationMs: 750,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, faceCount: 1 });
    sm.update({ timestamp: 1300, faceCount: 1 });

    // Background passerby for 600ms (t=1500 to t=2100)
    sm.update({ timestamp: 1500, faceCount: 2 });
    sm.update({ timestamp: 1800, faceCount: 2 });
    sm.update({ timestamp: 2100, faceCount: 1 }); // Face count returns to 1 before 750ms

    const multiEvents = emittedEvents.filter((e) => e.type === 'MULTIPLE_FACES');
    assert.equal(multiEvents.length, 0, 'Transient multiple faces must be filtered out');
  });

  // ─── Scenario 5: Sustained Multiple Faces Episode ───────────────
  it('5. Sustained multiple faces (1500ms) emits MULTIPLE_FACES with duration and maxFacesObserved', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      multipleFaceConfirmationMs: 750,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, faceCount: 1 });
    sm.update({ timestamp: 1300, faceCount: 1 });

    // Multiple faces begins at t=1500
    sm.update({ timestamp: 1500, faceCount: 2 });
    sm.update({ timestamp: 2000, faceCount: 3 }); // max faces observed reaches 3
    sm.update({ timestamp: 2300, faceCount: 2 }); // confirmed at t=2250 (>= 750ms)
    sm.update({ timestamp: 2800, faceCount: 2 });

    // Returns to single face at t=3000 (total duration: 3000 - 1500 = 1500ms)
    sm.update({ timestamp: 3000, faceCount: 1 });

    const multiEvents = emittedEvents.filter((e) => e.type === 'MULTIPLE_FACES');
    assert.equal(multiEvents.length, 1, 'Exactly one MULTIPLE_FACES event should be emitted');
    assert.equal(multiEvents[0].duration, 1500);
    assert.equal(multiEvents[0].source, 'webcam');
    assert.equal(multiEvents[0].metadata.maxFacesObserved, 3);
    assert.equal(multiEvents[0].metadata.confirmedDurationMs, 1500);
  });

  // ─── Scenario 6: Transient Head Pose Deviation Filtered Out ─────
  it('6. Transient pose deviation (< 1000ms) is filtered out without HEAD_POSE_DEVIATION event', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      poseDeviationConfirmationMs: 1000,
      yawThresholdDeg: 28,
      pitchThresholdDeg: 22,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, faceCount: 1, pose: { yaw: 5, pitch: 3 } });

    // Glanced right for 700ms (yaw=35° > 28° threshold)
    sm.update({ timestamp: 1500, faceCount: 1, pose: { yaw: 35, pitch: 5 } });
    sm.update({ timestamp: 1900, faceCount: 1, pose: { yaw: 32, pitch: 4 } });

    // Returned to center at t=2200 (700ms < 1000ms)
    sm.update({ timestamp: 2200, faceCount: 1, pose: { yaw: 10, pitch: 2 } });

    const poseEvents = emittedEvents.filter((e) => e.type === 'HEAD_POSE_DEVIATION');
    assert.equal(poseEvents.length, 0, 'Transient glance must be filtered out');
  });

  // ─── Scenario 7: Sustained Head Pose Deviation Episode ──────────
  it('7. Sustained pose deviation (2500ms) emits HEAD_POSE_DEVIATION with duration and peak angles', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      poseDeviationConfirmationMs: 1000,
      yawThresholdDeg: 28,
      pitchThresholdDeg: 22,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, faceCount: 1, pose: { yaw: 0, pitch: 0 } });

    // Turned head left (yaw = -34°) starting at t=1500
    sm.update({ timestamp: 1500, faceCount: 1, pose: { yaw: -34, pitch: 5 } });
    sm.update({ timestamp: 2000, faceCount: 1, pose: { yaw: -42, pitch: 8 } }); // peak yaw -42°
    sm.update({ timestamp: 2550, faceCount: 1, pose: { yaw: -38, pitch: 6 } }); // confirmed at t=2500
    sm.update({ timestamp: 3500, faceCount: 1, pose: { yaw: -30, pitch: 4 } });

    // Returned to neutral at t=4000 (total duration: 4000 - 1500 = 2500ms)
    sm.update({ timestamp: 4000, faceCount: 1, pose: { yaw: 5, pitch: 2 } });

    const poseEvents = emittedEvents.filter((e) => e.type === 'HEAD_POSE_DEVIATION');
    assert.equal(poseEvents.length, 1, 'Exactly one HEAD_POSE_DEVIATION event should be emitted');
    assert.equal(poseEvents[0].duration, 2500);
    assert.equal(poseEvents[0].source, 'webcam');
    assert.equal(poseEvents[0].metadata.maxYaw, -42);
    assert.equal(poseEvents[0].metadata.direction, 'left');
  });

  // ─── Scenario 8: Stop / Teardown with Open Episodes ─────────────
  it('8. stop() closes any confirmed open episodes with accurate final duration and resets', () => {
    const emittedEvents = [];
    const sm = new ObservationStateMachine({
      absentConfirmationMs: 1000,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, faceCount: 1 });
    sm.update({ timestamp: 1300, faceCount: 1 });

    // Absence begins at t=1500 and is confirmed at t=2500
    sm.update({ timestamp: 1500, faceCount: 0 });
    sm.update({ timestamp: 2500, faceCount: 0 });

    // Exam is submitted / stopped at t=4500 without face returning
    sm.stop(4500);

    const absentEvents = emittedEvents.filter((e) => e.type === 'FACE_ABSENT');
    assert.equal(absentEvents.length, 1, 'Active absence episode must close upon stop()');
    assert.equal(absentEvents[0].duration, 3000, 'Duration must be 4500 - 1500 = 3000ms');

    // Verify state machine is completely clean
    const state = sm.getState();
    assert.equal(state.isAbsentConfirmed, false);
    assert.equal(state.confirmedFaceState, 'unknown');
  });
});
