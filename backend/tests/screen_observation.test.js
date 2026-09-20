const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ScreenObservationStateMachine = require('../../frontend/scripts/proctoring/screenObservationState.js');

describe('Screen Observation State Machine (Phase 4)', () => {
  // ─── Test 1: Stable Expected View ──────────────────────────────
  it('1. Stable expected view produces exactly one SCREEN_VIEW_STABLE event with no duplicates', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      stableConfirmationMs: 1000,
      changeConfirmationMs: 1500,
      similarityThreshold: 0.75,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    // t=0: initial sample
    sm.update({ timestamp: 1000, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
    assert.equal(emittedEvents.length, 0, 'Candidate stable view must not emit immediately');

    // t=500: progressing
    sm.update({ timestamp: 1500, similarity: 0.94, classification: 'EXPECTED_EXAM_VIEW' });
    assert.equal(emittedEvents.length, 0);

    // t=1000: stableConfirmationMs threshold reached
    sm.update({ timestamp: 2000, similarity: 0.96, classification: 'EXPECTED_EXAM_VIEW' });
    assert.equal(emittedEvents.length, 1, 'Should emit SCREEN_VIEW_STABLE upon confirmation');
    assert.equal(emittedEvents[0].type, 'SCREEN_VIEW_STABLE');
    assert.equal(emittedEvents[0].source, 'screen');
    assert.equal(emittedEvents[0].duration, 0);
    assert.equal(emittedEvents[0].metadata.classification, 'EXPECTED_EXAM_VIEW');

    // Continued stable frames must NOT duplicate events
    for (let t = 2500; t <= 5000; t += 500) {
      sm.update({ timestamp: t, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
    }
    assert.equal(emittedEvents.length, 1, 'Continuous expected view must not produce duplicate events');
  });

  // ─── Test 2: Transient Screen Difference ───────────────────────
  it('2. Transient screen difference (< 1500ms) is filtered out with no SCREEN_VIEW_CHANGED emitted', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      stableConfirmationMs: 1000,
      changeConfirmationMs: 1500,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    // Establish stable expected view at t=1000..2000
    sm.update({ timestamp: 1000, similarity: 0.92 });
    sm.update({ timestamp: 2000, similarity: 0.95 });
    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0].type, 'SCREEN_VIEW_STABLE');

    // Transient difference for 200ms (t=2500 to t=2700)
    sm.update({ timestamp: 2500, similarity: 0.35, classification: 'CHANGED' });
    sm.update({ timestamp: 2700, similarity: 0.94, classification: 'EXPECTED_EXAM_VIEW' });

    // Transient difference for 700ms (t=3000 to t=3700)
    sm.update({ timestamp: 3000, similarity: 0.40, classification: 'CHANGED' });
    sm.update({ timestamp: 3500, similarity: 0.38, classification: 'CHANGED' });
    sm.update({ timestamp: 3700, similarity: 0.93, classification: 'EXPECTED_EXAM_VIEW' });

    const changedEvents = emittedEvents.filter((e) => e.type === 'SCREEN_VIEW_CHANGED');
    assert.equal(changedEvents.length, 0, 'Transient differences below 1500ms must be filtered out');
  });

  // ─── Test 3: Sustained Screen Difference ───────────────────────
  it('3. Sustained difference (>= 1500ms) confirms a SCREEN_VIEW_CHANGED episode', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      stableConfirmationMs: 1000,
      changeConfirmationMs: 1500,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, similarity: 0.95 });
    sm.update({ timestamp: 2000, similarity: 0.95 });

    // Visual deviation begins at t=2500
    sm.update({ timestamp: 2500, similarity: 0.42, classification: 'CHANGED' });
    sm.update({ timestamp: 3000, similarity: 0.38, classification: 'CHANGED' });
    sm.update({ timestamp: 3500, similarity: 0.35, classification: 'CHANGED' });

    // At t=4000 (1500ms elapsed since t=2500), change is confirmed
    sm.update({ timestamp: 4000, similarity: 0.31, classification: 'CHANGED' });

    const state = sm.getState();
    assert.equal(state.isChangeConfirmed, true, 'Episode must be confirmed after 1500ms deviation');
    assert.equal(state.currentState, 'SCREEN_VIEW_CHANGED');
  });

  // ─── Test 4: Return to Expected Closes Change Episode ──────────
  it('4. Sustained difference followed by return to expected emits SCREEN_VIEW_CHANGED with duration and resets', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      stableConfirmationMs: 1000,
      changeConfirmationMs: 1500,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, similarity: 0.95 });
    sm.update({ timestamp: 2000, similarity: 0.95 });

    // Deviation from t=2500 to t=5000 (total duration = 2500ms)
    sm.update({ timestamp: 2500, similarity: 0.40, classification: 'CHANGED' });
    sm.update({ timestamp: 3000, similarity: 0.28, classification: 'CHANGED' }); // lowest similarity 0.28
    sm.update({ timestamp: 4000, similarity: 0.32, classification: 'CHANGED' }); // confirmed at t=4000
    sm.update({ timestamp: 4500, similarity: 0.35, classification: 'CHANGED' });

    // Returns to expected view at t=5000
    sm.update({ timestamp: 5000, similarity: 0.92, classification: 'EXPECTED_EXAM_VIEW' });

    const changedEvents = emittedEvents.filter((e) => e.type === 'SCREEN_VIEW_CHANGED');
    assert.equal(changedEvents.length, 1, 'Exactly one SCREEN_VIEW_CHANGED event must be emitted');
    assert.equal(changedEvents[0].duration, 2500, 'Duration must equal 5000 - 2500 = 2500ms');
    assert.equal(changedEvents[0].source, 'screen');
    assert.equal(changedEvents[0].metadata.similarity, 0.28, 'Must record minimum observed similarity');
    assert.equal(changedEvents[0].metadata.classification, 'CHANGED');

    // After remaining expected for 1000ms (t=6000), stable view should re-confirm
    sm.update({ timestamp: 6000, similarity: 0.93, classification: 'EXPECTED_EXAM_VIEW' });
    const stableEvents = emittedEvents.filter((e) => e.type === 'SCREEN_VIEW_STABLE');
    assert.equal(stableEvents.length, 2, 'SCREEN_VIEW_STABLE re-triggers after return to stability');
  });

  // ─── Test 5: Capture Unavailable ───────────────────────────────
  it('5. Capture unavailable emits SCREEN_VIEW_UNAVAILABLE once with no duplicates', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, similarity: 0.95 });
    sm.update({ timestamp: 2000, similarity: 0.95 });

    // Screen stream lost or track ended
    sm.update({ timestamp: 2500, isAvailable: false, classification: 'UNAVAILABLE' });
    sm.update({ timestamp: 3000, isAvailable: false, classification: 'UNAVAILABLE' });
    sm.update({ timestamp: 3500, isAvailable: false, classification: 'UNAVAILABLE' });

    const unavailEvents = emittedEvents.filter((e) => e.type === 'SCREEN_VIEW_UNAVAILABLE');
    assert.equal(unavailEvents.length, 1, 'SCREEN_VIEW_UNAVAILABLE must be emitted exactly once');
    assert.equal(unavailEvents[0].source, 'screen');
  });

  // ─── Test 6: Cleanup & Stop ────────────────────────────────────
  it('6. stop() closes any open change episodes with final duration, and ignores observations after stop', () => {
    const emittedEvents = [];
    const sm = new ScreenObservationStateMachine({
      changeConfirmationMs: 1500,
      onObservation: (ev) => emittedEvents.push(ev),
    });

    sm.update({ timestamp: 1000, similarity: 0.95 });
    sm.update({ timestamp: 2000, similarity: 0.95 });

    // Deviation begins at t=2500 and is confirmed at t=4000
    sm.update({ timestamp: 2500, similarity: 0.35, classification: 'CHANGED' });
    sm.update({ timestamp: 4000, similarity: 0.30, classification: 'CHANGED' });

    // Exam ends / submitted at t=5500 while still deviated
    sm.stop(5500);

    const changedEvents = emittedEvents.filter((e) => e.type === 'SCREEN_VIEW_CHANGED');
    assert.equal(changedEvents.length, 1, 'Active change episode must close upon stop()');
    assert.equal(changedEvents[0].duration, 3000, 'Duration must equal 5500 - 2500 = 3000ms');

    // Any subsequent observations after stop must be completely ignored
    sm.update({ timestamp: 6000, similarity: 0.20, classification: 'CHANGED' });
    sm.update({ timestamp: 7000, similarity: 0.95, classification: 'EXPECTED_EXAM_VIEW' });
    assert.equal(changedEvents.length, 1, 'No events must be emitted after stop()');
  });
});
