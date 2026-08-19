const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const TestResult = require('../models/TestResult');
const { getTestHistory, getDashboard } = require('../controllers/testController');

describe('Query Efficiency, Indexing & Pagination Suite', () => {

  // 1. Verify compound index on TestResult
  it('1. TestResult schema declares compound index { user: 1, createdAt: -1 }', () => {
    const indexes = TestResult.schema.indexes();
    const compoundIndex = indexes.find(
      (idx) => idx[0] && idx[0].user === 1 && idx[0].createdAt === -1
    );

    assert.ok(compoundIndex, 'Expected compound index { user: 1, createdAt: -1 } on TestResult schema');
  });

  // 2. Test history pagination and default limits
  it('2. getTestHistory paginates results and enforces limit boundaries', async () => {
    const mockResults = [];
    const userId = 'user_pag_1';

    // Create 15 mock results with sequential dates
    for (let i = 0; i < 15; i++) {
      mockResults.push({
        _id: `result_${i}`,
        user: userId,
        subject: 'physics',
        chapter: 'kinematics',
        score: i % 10,
        totalQuestions: 10,
        createdAt: new Date(Date.now() - i * 60000), // Newer first
      });
    }

    const originalCountDocuments = TestResult.countDocuments;
    const originalFind = TestResult.find;

    TestResult.countDocuments = async (filter) => {
      assert.equal(filter.user, userId);
      return mockResults.length;
    };

    TestResult.find = (filter) => {
      assert.equal(filter.user, userId);
      let skipVal = 0;
      let limitVal = 10;

      const queryObj = {
        select: () => queryObj,
        sort: (sortObj) => {
          assert.equal(sortObj.createdAt, -1);
          return queryObj;
        },
        skip: (val) => {
          skipVal = val;
          return queryObj;
        },
        limit: (val) => {
          limitVal = val;
          return queryObj;
        },
        lean: () => {
          return Promise.resolve(mockResults.slice(skipVal, skipVal + limitVal));
        },
      };
      return queryObj;
    };

    try {
      // Test Page 1 (limit 5)
      const req1 = {
        user: { id: userId },
        query: { page: '1', limit: '5' },
      };
      let resData1 = null;
      const res1 = {
        status: (code) => {
          assert.equal(code, 200);
          return res1;
        },
        json: (payload) => {
          resData1 = payload;
          return res1;
        },
      };

      await getTestHistory(req1, res1, () => {});
      assert.equal(resData1.success, true);
      assert.equal(resData1.page, 1);
      assert.equal(resData1.limit, 5);
      assert.equal(resData1.totalResults, 15);
      assert.equal(resData1.totalPages, 3);
      assert.equal(resData1.hasMore, true);
      assert.equal(resData1.results.length, 5);
      assert.equal(resData1.results[0]._id, 'result_0'); // Most recent

      // Test Page 3 (limit 5)
      const req3 = {
        user: { id: userId },
        query: { page: '3', limit: '5' },
      };
      let resData3 = null;
      const res3 = {
        status: (code) => {
          assert.equal(code, 200);
          return res3;
        },
        json: (payload) => {
          resData3 = payload;
          return res3;
        },
      };

      await getTestHistory(req3, res3, () => {});
      assert.equal(resData3.success, true);
      assert.equal(resData3.page, 3);
      assert.equal(resData3.limit, 5);
      assert.equal(resData3.totalResults, 15);
      assert.equal(resData3.totalPages, 3);
      assert.equal(resData3.hasMore, false);
      assert.equal(resData3.results.length, 5);
      assert.equal(resData3.results[0]._id, 'result_10');

      // Test Max Limit Capping (client asks for limit 1000 -> capped at 50)
      const reqMax = {
        user: { id: userId },
        query: { page: '1', limit: '1000' },
      };
      let resDataMax = null;
      const resMax = {
        status: () => resMax,
        json: (payload) => {
          resDataMax = payload;
          return resMax;
        },
      };

      await getTestHistory(reqMax, resMax, () => {});
      assert.equal(resDataMax.limit, 50, 'Limit should be capped at 50');
    } finally {
      TestResult.countDocuments = originalCountDocuments;
      TestResult.find = originalFind;
    }
  });

  // 3. Test empty history returns structured empty state
  it('3. getTestHistory handles empty history cleanly', async () => {
    const originalCountDocuments = TestResult.countDocuments;
    const originalFind = TestResult.find;

    TestResult.countDocuments = async () => 0;
    TestResult.find = () => ({
      select: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => Promise.resolve([]),
            }),
          }),
        }),
      }),
    });

    try {
      const req = {
        user: { id: 'empty_user' },
        query: {},
      };
      let resData = null;
      const res = {
        status: (code) => {
          assert.equal(code, 200);
          return res;
        },
        json: (payload) => {
          resData = payload;
          return res;
        },
      };

      await getTestHistory(req, res, () => {});
      assert.equal(resData.success, true);
      assert.equal(resData.totalResults, 0);
      assert.equal(resData.totalPages, 1);
      assert.equal(resData.hasMore, false);
      assert.deepEqual(resData.results, []);
    } finally {
      TestResult.countDocuments = originalCountDocuments;
      TestResult.find = originalFind;
    }
  });

  // 4. Test dashboard calculation correctness with lean query
  it('4. getDashboard computes accurate metrics and insights using lean query', async () => {
    const userId = 'user_dash_test';
    const mockResults = [
      {
        _id: 'r1',
        user: userId,
        subject: 'physics',
        chapter: 'kinematics',
        score: 9,
        totalQuestions: 10, // 90%
        createdAt: new Date(),
      },
      {
        _id: 'r2',
        user: userId,
        subject: 'chemistry',
        chapter: 'thermodynamics',
        score: 8,
        totalQuestions: 10, // 80%
        createdAt: new Date(Date.now() - 1000),
      },
      {
        _id: 'r3',
        user: userId,
        subject: 'maths',
        chapter: 'matrices',
        score: 4,
        totalQuestions: 10, // 40% (weakest)
        createdAt: new Date(Date.now() - 2000),
      },
    ];

    const originalFind = TestResult.find;
    TestResult.find = (filter) => {
      assert.equal(filter.user, userId);
      return {
        select: (fields) => {
          assert.ok(fields.includes('subject'));
          assert.ok(fields.includes('score'));
          assert.ok(fields.includes('totalQuestions'));
          assert.ok(fields.includes('createdAt'));
          return {
            sort: (sortObj) => {
              assert.equal(sortObj.createdAt, -1);
              return {
                lean: () => Promise.resolve(mockResults),
              };
            },
          };
        },
      };
    };

    try {
      const req = { user: { id: userId } };
      let resData = null;
      const res = {
        status: (code) => {
          assert.equal(code, 200);
          return res;
        },
        json: (payload) => {
          resData = payload;
          return res;
        },
      };

      await getDashboard(req, res, () => {});
      assert.equal(resData.success, true);
      const db = resData.dashboard;
      assert.equal(db.totalTests, 3);
      assert.equal(db.averageScorePercentage, 70); // (90 + 80 + 40) / 3 = 70%
      assert.equal(db.latestTest._id, 'r1');
      assert.equal(db.subjectWiseTestCounts.physics, 1);
      assert.equal(db.subjectWiseTestCounts.chemistry, 1);
      assert.equal(db.subjectWiseTestCounts.maths, 1);
      assert.equal(db.insights.strongestSubject, 'Physics');
      assert.equal(db.insights.weakestSubject, 'Maths');
    } finally {
      TestResult.find = originalFind;
    }
  });

  // 5. Test Multi-User Isolation
  it('5. multi-user isolation: queries strictly filter by req.user.id', async () => {
    const allDbData = [
      { _id: 'u1_r1', user: 'user_A', subject: 'physics', chapter: 'kinematics', score: 10, totalQuestions: 10, createdAt: new Date() },
      { _id: 'u2_r1', user: 'user_B', subject: 'chemistry', chapter: 'thermodynamics', score: 5, totalQuestions: 10, createdAt: new Date() },
    ];

    const originalFind = TestResult.find;
    const originalCount = TestResult.countDocuments;

    TestResult.countDocuments = async (filter) => {
      return allDbData.filter((d) => d.user === filter.user).length;
    };

    TestResult.find = (filter) => ({
      select: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => Promise.resolve(allDbData.filter((d) => d.user === filter.user)),
            }),
          }),
          lean: () => Promise.resolve(allDbData.filter((d) => d.user === filter.user)),
        }),
      }),
    });

    try {
      // User A history request
      const reqA = { user: { id: 'user_A' }, query: {} };
      let resDataA = null;
      const resA = {
        status: () => resA,
        json: (payload) => {
          resDataA = payload;
          return resA;
        },
      };

      await getTestHistory(reqA, resA, () => {});
      assert.equal(resDataA.totalResults, 1);
      assert.equal(resDataA.results[0]._id, 'u1_r1');
      assert.equal(resDataA.results.some((r) => r.user === 'user_B'), false);

      // User B dashboard request
      const reqB = { user: { id: 'user_B' } };
      let resDataB = null;
      const resB = {
        status: () => resB,
        json: (payload) => {
          resDataB = payload;
          return resB;
        },
      };

      await getDashboard(reqB, resB, () => {});
      assert.equal(resDataB.dashboard.totalTests, 1);
      assert.equal(resDataB.dashboard.latestTest._id, 'u2_r1');
      assert.equal(resDataB.dashboard.subjectWiseTestCounts.physics, undefined);
      assert.equal(resDataB.dashboard.subjectWiseTestCounts.chemistry, 1);
    } finally {
      TestResult.find = originalFind;
      TestResult.countDocuments = originalCount;
    }
  });

});
