const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calculateStreak, extractUtcDateString } = require('../services/streakService');
const { getDashboard } = require('../controllers/testController');
const TestResult = require('../models/TestResult');

describe('Targeted Streak Calculation Suite', () => {

  // Helper to construct UTC date string from offset days relative to a reference UTC date
  const createUtcDate = (ref, offsetDays, hours = 12, minutes = 0) => {
    const d = new Date(ref);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays, hours, minutes));
  };

  const BASE_REF = new Date('2026-09-10T14:00:00.000Z');

  // 1. Empty, null, undefined, and non-array inputs
  it('1. returns 0 for empty, null, or undefined results array', () => {
    assert.equal(calculateStreak([], BASE_REF), 0);
    assert.equal(calculateStreak(null, BASE_REF), 0);
    assert.equal(calculateStreak(undefined, BASE_REF), 0);
    assert.equal(calculateStreak('invalid', BASE_REF), 0);
  });

  // 2. Malformed date handling
  it('2. safely ignores invalid dates and malformed objects without throwing', () => {
    const results = [
      { createdAt: 'not-a-date' },
      { createdAt: null },
      null,
      {},
      { date: undefined },
    ];
    assert.equal(calculateStreak(results, BASE_REF), 0);
  });

  // 3. Single test completed today
  it('3. returns streak of 1 when a test was completed today', () => {
    const results = [
      { createdAt: createUtcDate(BASE_REF, 0, 10, 30) },
    ];
    assert.equal(calculateStreak(results, BASE_REF), 1);
  });

  // 4. Multiple tests on the same calendar day count as ONE practice day
  it('4. multiple tests on the same calendar day count as one practice day', () => {
    const results = [
      { createdAt: createUtcDate(BASE_REF, 0, 8, 0) },
      { createdAt: createUtcDate(BASE_REF, 0, 12, 30) },
      { createdAt: createUtcDate(BASE_REF, 0, 18, 45) },
      { createdAt: createUtcDate(BASE_REF, 0, 23, 15) },
    ];
    assert.equal(calculateStreak(results, BASE_REF), 1);
  });

  // 5. Multiple tests per day across consecutive days
  it('5. counts consecutive days correctly with multiple tests per day', () => {
    const results = [
      // Today (Day 0) - 3 tests
      { createdAt: createUtcDate(BASE_REF, 0, 9, 0) },
      { createdAt: createUtcDate(BASE_REF, 0, 15, 0) },
      { createdAt: createUtcDate(BASE_REF, 0, 21, 0) },
      // Yesterday (Day -1) - 2 tests
      { createdAt: createUtcDate(BASE_REF, -1, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -1, 16, 0) },
      // Day -2 - 1 test
      { createdAt: createUtcDate(BASE_REF, -2, 11, 0) },
      // Day -3 - 4 tests
      { createdAt: createUtcDate(BASE_REF, -3, 8, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 12, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 17, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 22, 0) },
    ];
    assert.equal(calculateStreak(results, BASE_REF), 4);
  });

  // 6. Active streak preserved when practiced yesterday but not today yet
  it('6. preserves active streak if user practiced yesterday but has not practiced today yet', () => {
    const results = [
      // Yesterday (Day -1)
      { createdAt: createUtcDate(BASE_REF, -1, 10, 0) },
      // Day -2
      { createdAt: createUtcDate(BASE_REF, -2, 14, 0) },
      // Day -3
      { createdAt: createUtcDate(BASE_REF, -3, 18, 0) },
    ];
    // Active streak should be 3 (Day -1, Day -2, Day -3)
    assert.equal(calculateStreak(results, BASE_REF), 3);
  });

  // 7. Gaps break current streak
  it('7. gaps break the current streak', () => {
    // Subcase 7a: Practiced today and Day -2, missed yesterday (Day -1)
    const gapYesterday = [
      { createdAt: createUtcDate(BASE_REF, 0, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -2, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 10, 0) },
    ];
    assert.equal(calculateStreak(gapYesterday, BASE_REF), 1);

    // Subcase 7b: Practiced yesterday (Day -1) and Day -3, missed Day -2
    const gapDayBefore = [
      { createdAt: createUtcDate(BASE_REF, -1, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -4, 10, 0) },
    ];
    assert.equal(calculateStreak(gapDayBefore, BASE_REF), 1);

    // Subcase 7c: Most recent practice was 2 days ago (missed yesterday and today)
    const gapTwoDaysAgo = [
      { createdAt: createUtcDate(BASE_REF, -2, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -3, 10, 0) },
      { createdAt: createUtcDate(BASE_REF, -4, 10, 0) },
    ];
    assert.equal(calculateStreak(gapTwoDaysAgo, BASE_REF), 0);
  });

  // 8. Timezone independence (UTC-based calendar date extraction)
  it('8. date handling is consistent and strictly timezone-independent (UTC)', () => {
    // Tests right around midnight UTC
    const nearMidnightToday = { createdAt: '2026-09-10T00:00:01.000Z' };
    const nearMidnightYesterday = { createdAt: '2026-09-09T23:59:59.000Z' };

    assert.equal(extractUtcDateString(nearMidnightToday), '2026-09-10');
    assert.equal(extractUtcDateString(nearMidnightYesterday), '2026-09-09');

    const results = [nearMidnightToday, nearMidnightYesterday];
    assert.equal(calculateStreak(results, new Date('2026-09-10T12:00:00.000Z')), 2);

    // Month boundary leap year transition (e.g. 2024-03-01 -> 2024-02-29)
    const leapYearRef = new Date('2024-03-01T10:00:00.000Z');
    const leapYearResults = [
      { createdAt: '2024-03-01T08:00:00.000Z' },
      { createdAt: '2024-02-29T20:00:00.000Z' },
      { createdAt: '2024-02-28T15:00:00.000Z' },
    ];
    assert.equal(calculateStreak(leapYearResults, leapYearRef), 3);
  });

  // 9. Streak does NOT depend on paginated /api/tests/history response
  it('9. getDashboard computes streak across all test dates (exceeding history pagination limit)', async () => {
    const userId = 'user_streak_long';
    // Create 15 tests across 15 consecutive days (pagination limit is 10)
    const mockResults = [];
    for (let i = 0; i < 15; i++) {
      mockResults.push({
        _id: `res_${i}`,
        user: userId,
        subject: 'physics',
        chapter: 'kinematics',
        score: 10,
        totalQuestions: 10,
        createdAt: createUtcDate(new Date(), -i, 12, 0),
      });
    }

    const originalFind = TestResult.find;
    TestResult.find = (filter) => {
      assert.equal(filter.user, userId);
      return {
        select: () => ({
          sort: () => ({
            lean: () => Promise.resolve(mockResults),
          }),
        }),
      };
    };

    try {
      const req = { user: { id: userId } };
      let resPayload = null;
      const res = {
        status: (code) => {
          assert.equal(code, 200);
          return res;
        },
        json: (payload) => {
          resPayload = payload;
          return res;
        },
      };

      await getDashboard(req, res, () => {});

      assert.equal(resPayload.success, true);
      assert.equal(resPayload.dashboard.totalTests, 15);
      // The streak must be 15, proving it did NOT get truncated by history pagination limit (10)
      assert.equal(resPayload.dashboard.currentStreak, 15);
      assert.equal(resPayload.dashboard.streak, 15);
    } finally {
      TestResult.find = originalFind;
    }
  });

});
