const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MockTestSession = require('../models/MockTestSession');
const {
  getMockTestHistory,
  getMockTestStats,
} = require('../controllers/mockTestController');
const { protect } = require('../middleware/authMiddleware');

describe('Mock-Test History & Dashboard Integration Suite (Phase 4D)', () => {
  function createMockRes() {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.body = data;
        return res;
      },
    };
    return res;
  }

  function createMockSession(options = {}) {
    return {
      _id: options._id || 'sess_' + Math.random().toString(36).slice(2, 9),
      user: options.user || 'user_cand_1',
      mockTest: options.mockTest || {
        _id: 'mock_test_jee_1',
        title: 'JEE Main Practice Mock Test 1',
        slug: 'jee-main-practice-1',
        description: 'Comprehensive 3-hour practice exam',
        duration: 180,
        totalMarks: 300,
      },
      status: options.status || 'completed',
      evaluationStatus: options.evaluationStatus || 'EVALUATED',
      startedAt: options.startedAt || new Date('2026-09-27T10:00:00.000Z'),
      submittedAt: options.submittedAt || new Date('2026-09-27T13:00:00.000Z'),
      createdAt: options.createdAt || options.startedAt || new Date('2026-09-27T10:00:00.000Z'),
      result: options.result !== undefined ? options.result : {
        score: 148,
        maxMarks: 300,
        totalQuestions: 75,
        correctCount: 40,
        incorrectCount: 12,
        unattemptedCount: 23,
        accuracy: 76.9,
        percentage: 49.3,
        sectionScores: { physics: 52, chemistry: 48, maths: 48 },
      },
      reviewAudit: options.reviewAudit || null,
      proctoringSession: 'proc_sess_internal',
      proctoringAssessment: 'proc_assess_internal',
    };
  }

  function mockFindWithArray(allSessions) {
    const origFind = MockTestSession.find;
    const origCountDocuments = MockTestSession.countDocuments;

    return {
      install() {
        MockTestSession.countDocuments = async (filter) => {
          const userId = filter.user;
          return allSessions.filter((s) => s.user.toString() === userId.toString()).length;
        };

        MockTestSession.find = (filter) => {
          const userId = filter.user;
          let matched = allSessions.filter((s) => s.user.toString() === userId.toString());

          const query = {
            sort(sortObj) {
              if (sortObj && sortObj.createdAt === -1) {
                matched = [...matched].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              }
              return query;
            },
            skip(n) {
              matched = matched.slice(n);
              return query;
            },
            limit(n) {
              matched = matched.slice(0, n);
              return query;
            },
            populate(field, select) {
              return query;
            },
            select(fields) {
              return query;
            },
            async lean() {
              return matched;
            },
            then(resolve, reject) {
              return Promise.resolve(matched).then(resolve, reject);
            },
          };
          return query;
        };
      },
      restore() {
        MockTestSession.find = origFind;
        MockTestSession.countDocuments = origCountDocuments;
      },
    };
  }

  // ─── TEST 1: User with evaluated attempts contains scores ───────
  it('TEST 1: User with evaluated attempts -> history contains them with scores', async () => {
    const sessions = [
      createMockSession({
        _id: 'sess_eval_1',
        user: 'user_cand_1',
        evaluationStatus: 'EVALUATED',
        result: {
          score: 180,
          maxMarks: 300,
          totalQuestions: 75,
          correctCount: 48,
          incorrectCount: 12,
          unattemptedCount: 15,
          accuracy: 80,
          percentage: 60,
        },
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
        query: { page: '1', limit: '10' },
      };
      const res = createMockRes();

      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 1);
      const item = res.body.data[0];
      assert.equal(item.evaluationStatus, 'EVALUATED');
      assert.equal(item.score, 180);
      assert.equal(item.maxMarks, 300);
      assert.equal(item.percentage, 60);
      assert.equal(item.accuracy, 80);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 2: User with held behavioral attempt -> HELD_FOR_REVIEW, no score ──
  it('TEST 2: User with held behavioral attempt -> history contains it with HELD_FOR_REVIEW and no score', async () => {
    const sessions = [
      createMockSession({
        _id: 'sess_held_beh_1',
        user: 'user_cand_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
        query: {},
      };
      const res = createMockRes();

      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 1);
      const item = res.body.data[0];
      assert.equal(item.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(item.score, null, 'Score must be null, never 0');
      assert.equal(item.percentage, null);
      assert.equal(item.accuracy, null);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 3: User with held technical attempt -> HELD_TECHNICAL_REVIEW, no score ──
  it('TEST 3: User with held technical attempt -> history contains it with HELD_TECHNICAL_REVIEW and no score', async () => {
    const sessions = [
      createMockSession({
        _id: 'sess_held_tech_1',
        user: 'user_cand_1',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
        query: {},
      };
      const res = createMockRes();

      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 1);
      const item = res.body.data[0];
      assert.equal(item.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(item.score, null, 'Score must be null, never 0');
      assert.equal(item.percentage, null);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 4: User with rejected attempt -> REJECTED, no score ───
  it('TEST 4: User with rejected attempt -> history contains it with REJECTED and no score', async () => {
    const sessions = [
      createMockSession({
        _id: 'sess_rejected_1',
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
        query: {},
      };
      const res = createMockRes();

      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 1);
      const item = res.body.data[0];
      assert.equal(item.evaluationStatus, 'REJECTED');
      assert.equal(item.score, null, 'Score must be null');
      assert.equal(item.percentage, null);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 5: Mixed attempts appear correctly ───────────────────
  it('TEST 5: Mixed attempts -> all appear correctly with scores only when EVALUATED', async () => {
    const sessions = [
      createMockSession({
        _id: 's_eval',
        user: 'user_cand_1',
        evaluationStatus: 'EVALUATED',
        result: { score: 200, percentage: 66.7, accuracy: 85, maxMarks: 300 },
      }),
      createMockSession({
        _id: 's_held_rev',
        user: 'user_cand_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
      createMockSession({
        _id: 's_held_tech',
        user: 'user_cand_1',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
      createMockSession({
        _id: 's_rej',
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
        query: {},
      };
      const res = createMockRes();

      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.length, 4);

      const evalItem = res.body.data.find((d) => d.sessionId === 's_eval');
      assert.equal(evalItem.score, 200);
      assert.equal(evalItem.percentage, 66.7);

      const heldRevItem = res.body.data.find((d) => d.sessionId === 's_held_rev');
      assert.equal(heldRevItem.score, null);

      const heldTechItem = res.body.data.find((d) => d.sessionId === 's_held_tech');
      assert.equal(heldTechItem.score, null);

      const rejItem = res.body.data.find((d) => d.sessionId === 's_rej');
      assert.equal(rejItem.score, null);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 6 & 7: Stats include only EVALUATED in academic averages ──
  it('TEST 6 & 7: Stats include only EVALUATED attempts in academic averages; held/rejected count toward totalAttempts only', async () => {
    // Exactly matches Section 9 example:
    // Attempt 1 -> EVALUATED, percentage 60, score 180
    // Attempt 2 -> EVALUATED, percentage 80, score 240
    // Attempt 3 -> HELD_FOR_REVIEW
    // Attempt 4 -> HELD_TECHNICAL_REVIEW
    // Attempt 5 -> REJECTED
    const sessions = [
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'EVALUATED',
        result: { score: 180, percentage: 60, accuracy: 75 },
      }),
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'EVALUATED',
        result: { score: 240, percentage: 80, accuracy: 85 },
      }),
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
      };
      const res = createMockRes();

      await getMockTestStats(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      const stats = res.body.stats;

      assert.equal(stats.totalAttempts, 5);
      assert.equal(stats.evaluatedAttempts, 2);
      assert.equal(stats.pendingReviewCount, 1);
      assert.equal(stats.technicalReviewCount, 1);
      assert.equal(stats.rejectedCount, 1);

      // (60 + 80) / 2 = 70
      assert.equal(stats.averagePercentage, 70);
      // (180 + 240) / 2 = 210
      assert.equal(stats.averageScore, 210);
      // (75 + 85) / 2 = 80
      assert.equal(stats.averageAccuracy, 80);
      assert.equal(stats.bestScore, 240);
      assert.equal(stats.bestPercentage, 80);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 8: Zero evaluated attempts -> average metrics are explicit null ──
  it('TEST 8: Zero evaluated attempts -> average metrics are explicit null', async () => {
    const sessions = [
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
      createMockSession({
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        result: undefined,
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = {
        user: { id: 'user_cand_1' },
      };
      const res = createMockRes();

      await getMockTestStats(req, res, () => {});

      assert.equal(res.statusCode, 200);
      const stats = res.body.stats;

      assert.equal(stats.totalAttempts, 2);
      assert.equal(stats.evaluatedAttempts, 0);
      assert.equal(stats.pendingReviewCount, 1);
      assert.equal(stats.rejectedCount, 1);

      // Academic metrics must be null, never NaN or 0
      assert.equal(stats.averageScore, null);
      assert.equal(stats.averagePercentage, null);
      assert.equal(stats.averageAccuracy, null);
      assert.equal(stats.bestScore, null);
      assert.equal(stats.bestPercentage, null);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 9: Pagination works correctly ─────────────────────────
  it('TEST 9: Pagination works correctly (page, limit, total, pages)', async () => {
    const sessions = [];
    for (let i = 1; i <= 15; i++) {
      sessions.push(
        createMockSession({
          _id: `sess_page_${i}`,
          user: 'user_cand_1',
          evaluationStatus: 'EVALUATED',
          createdAt: new Date(Date.now() - i * 10000),
        })
      );
    }

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      // Request page 1 with limit 10
      const req1 = {
        user: { id: 'user_cand_1' },
        query: { page: '1', limit: '10' },
      };
      const res1 = createMockRes();
      await getMockTestHistory(req1, res1, () => {});

      assert.equal(res1.body.data.length, 10);
      assert.equal(res1.body.pagination.page, 1);
      assert.equal(res1.body.pagination.limit, 10);
      assert.equal(res1.body.pagination.total, 15);
      assert.equal(res1.body.pagination.pages, 2);

      // Request page 2 with limit 10
      const req2 = {
        user: { id: 'user_cand_1' },
        query: { page: '2', limit: '10' },
      };
      const res2 = createMockRes();
      await getMockTestHistory(req2, res2, () => {});

      assert.equal(res2.body.data.length, 5);
      assert.equal(res2.body.pagination.page, 2);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 10: Newest attempts appear first ───────────────────────
  it('TEST 10: Newest attempts appear first', async () => {
    const oldDate = new Date('2026-09-01T10:00:00.000Z');
    const midDate = new Date('2026-09-15T10:00:00.000Z');
    const newDate = new Date('2026-09-27T10:00:00.000Z');

    const sessions = [
      createMockSession({ _id: 's_old', user: 'user_cand_1', createdAt: oldDate }),
      createMockSession({ _id: 's_new', user: 'user_cand_1', createdAt: newDate }),
      createMockSession({ _id: 's_mid', user: 'user_cand_1', createdAt: midDate }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = { user: { id: 'user_cand_1' }, query: {} };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      assert.equal(res.body.data.length, 3);
      assert.equal(res.body.data[0].sessionId, 's_new');
      assert.equal(res.body.data[1].sessionId, 's_mid');
      assert.equal(res.body.data[2].sessionId, 's_old');
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 11: Invalid page/limit cannot cause unbounded DB queries ──
  it('TEST 11: Invalid page/limit cannot cause unbounded database queries (limit clamped to 50, page normalized to 1)', async () => {
    const sessions = [];
    for (let i = 1; i <= 60; i++) {
      sessions.push(createMockSession({ user: 'user_cand_1' }));
    }

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      // Attacker attempts limit=1000000 and page=-5
      const req = {
        user: { id: 'user_cand_1' },
        query: { page: '-5', limit: '1000000' },
      };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.pagination.page, 1, 'Normalized page to 1');
      assert.equal(res.body.pagination.limit, 50, 'Clamped limit to 50 max');
      assert.equal(res.body.data.length, 50);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 12: User cannot retrieve another user's mock-test history ──
  it('TEST 12: User cannot retrieve another user\'s mock-test history', async () => {
    const sessions = [
      createMockSession({ _id: 's_user_a', user: 'user_A' }),
      createMockSession({ _id: 's_user_b', user: 'user_B' }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      // User A requests history
      const req = {
        user: { id: 'user_A' },
        query: {},
      };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].sessionId, 's_user_a');
      assert.ok(!res.body.data.some((d) => d.sessionId === 's_user_b'));
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 13: User cannot influence stats using a userId query parameter ──
  it('TEST 13: User cannot influence stats using a userId query parameter', async () => {
    const sessions = [
      createMockSession({
        user: 'user_victim',
        evaluationStatus: 'EVALUATED',
        result: { score: 300, percentage: 100 },
      }),
      createMockSession({
        user: 'user_attacker',
        evaluationStatus: 'EVALUATED',
        result: { score: 100, percentage: 33 },
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      // Attacker passes ?userId=user_victim
      const req = {
        user: { id: 'user_attacker' },
        query: { userId: 'user_victim' },
      };
      const res = createMockRes();
      await getMockTestStats(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.stats.totalAttempts, 1);
      assert.equal(res.body.stats.averagePercentage, 33);
      assert.notEqual(res.body.stats.averagePercentage, 100);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 14: EVALUATED history item can navigate to result ─────
  it('TEST 14: EVALUATED history item returns sessionId for navigation to result', async () => {
    const sessions = [
      createMockSession({
        _id: 'mock_sess_eval_navigation_target',
        user: 'user_cand_1',
        evaluationStatus: 'EVALUATED',
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = { user: { id: 'user_cand_1' }, query: {} };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].sessionId, 'mock_sess_eval_navigation_target');
      assert.equal(res.body.data[0].evaluationStatus, 'EVALUATED');
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 15: Held/rejected history items do not expose result data ──
  it('TEST 15: Held/rejected history items do not expose result data', async () => {
    const sessions = [
      createMockSession({
        _id: 's_held',
        user: 'user_cand_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: { score: 999 }, // Stale result that must be shielded
      }),
      createMockSession({
        _id: 's_rej',
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        result: { score: 888 },
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = { user: { id: 'user_cand_1' }, query: {} };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      res.body.data.forEach((item) => {
        assert.equal(item.score, null, 'Must be null for held/rejected');
        assert.equal(item.percentage, null);
        assert.equal(item.accuracy, null);
        assert.equal(item.sectionScores, null);
      });
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 16: History strictly withholds internal telemetry and review notes ──
  it('TEST 16: History strictly withholds internal telemetry and reviewAudit notes/identity', async () => {
    const sessions = [
      createMockSession({
        _id: 's_audit_test',
        user: 'user_cand_1',
        evaluationStatus: 'REJECTED',
        reviewAudit: {
          decision: 'REJECT',
          reviewedBy: 'reviewer_super_admin',
          notes: 'Candidate looked away repeatedly and used unauthorized material',
          reviewedAt: new Date(),
        },
      }),
    ];

    const mockDb = mockFindWithArray(sessions);
    mockDb.install();

    try {
      const req = { user: { id: 'user_cand_1' }, query: {} };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      const item = res.body.data[0];
      assert.equal(item.reviewAudit, undefined);
      assert.equal(item.notes, undefined);
      assert.equal(item.reviewedBy, undefined);
      assert.equal(item.proctoringSession, undefined);
      assert.equal(item.proctoringAssessment, undefined);
      assert.equal(item.answers, undefined);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 17: Empty mock-test history returns 200 with empty array ──
  it('TEST 17: User with no mock tests returns 200 with empty data array and valid pagination', async () => {
    const mockDb = mockFindWithArray([]);
    mockDb.install();

    try {
      const req = { user: { id: 'user_new' }, query: {} };
      const res = createMockRes();
      await getMockTestHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.data, []);
      assert.equal(res.body.pagination.total, 0);
      assert.equal(res.body.pagination.pages, 1);
    } finally {
      mockDb.restore();
    }
  });

  // ─── TEST 18: Empty mock-test stats returns 200 with zero counts and null academic metrics ──
  it('TEST 18: User with no mock tests returns 200 with zero counts and null academic metrics', async () => {
    const mockDb = mockFindWithArray([]);
    mockDb.install();

    try {
      const req = { user: { id: 'user_new' } };
      const res = createMockRes();
      await getMockTestStats(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.stats.totalAttempts, 0);
      assert.equal(res.body.stats.evaluatedAttempts, 0);
      assert.equal(res.body.stats.pendingReviewCount, 0);
      assert.equal(res.body.stats.technicalReviewCount, 0);
      assert.equal(res.body.stats.rejectedCount, 0);
      assert.equal(res.body.stats.averageScore, null);
      assert.equal(res.body.stats.averagePercentage, null);
    } finally {
      mockDb.restore();
    }
  });
});
