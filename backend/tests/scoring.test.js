const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const questionBank = require('../data/questionBank');
const { getSanitizedQuestions, validateAndScoreSubmission } = require('../services/testScoring');
const { getTestQuestions, saveTestResult } = require('../controllers/testController');
const TestResult = require('../models/TestResult');

describe('Server-Authoritative Test Scoring & Question Sanitization', () => {

  // Test 1: Sanitized API data contains NO answer keys
  it('1. sanitized API data contains no "answer" property across all chapters', () => {
    const subjects = Object.keys(questionBank);
    assert.ok(subjects.length >= 3, 'Must contain physics, chemistry, maths');

    for (const subject of subjects) {
      const chapters = Object.keys(questionBank[subject]);
      for (const chapter of chapters) {
        const sanitized = getSanitizedQuestions(subject, chapter);
        assert.equal(sanitized.length, 10, `Chapter ${subject}/${chapter} must have 10 questions`);
        for (const q of sanitized) {
          assert.ok(q.id, 'Question must have id');
          assert.ok(q.q, 'Question must have text');
          assert.ok(Array.isArray(q.options), 'Question must have options array');
          assert.equal(q.options.length, 4, 'Question must have 4 options');
          assert.equal(Object.prototype.hasOwnProperty.call(q, 'answer'), false, 'Sanitized question must NOT contain "answer" property');
          assert.equal(q.answer, undefined, 'answer property must be undefined');
        }
      }
    }
  });

  // Test 2: All correct answers produces 10/10
  it('2. all answers correct produces full score (10/10)', () => {
    const subject = 'physics';
    const chapter = 'kinematics';
    const authQuestions = questionBank[subject][chapter];

    const answers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));

    const result = validateAndScoreSubmission(subject, chapter, answers);
    assert.equal(result.score, 10);
    assert.equal(result.totalQuestions, 10);
  });

  // Test 3: All incorrect answers produces 0/10
  it('3. all answers incorrect produces 0 score (0/10)', () => {
    const subject = 'physics';
    const chapter = 'kinematics';
    const authQuestions = questionBank[subject][chapter];

    const answers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: (q.answer + 1) % 4, // Intentionally wrong answer
    }));

    const result = validateAndScoreSubmission(subject, chapter, answers);
    assert.equal(result.score, 0);
    assert.equal(result.totalQuestions, 10);
  });

  // Test 4: Mixed correct / incorrect scoring
  it('4. scoring with mixed correct and incorrect answers', () => {
    const subject = 'chemistry';
    const chapter = 'thermodynamics';
    const authQuestions = questionBank[subject][chapter];

    // Answer first 6 correctly, last 4 incorrectly
    const answers = authQuestions.map((q, index) => ({
      questionId: q.id,
      selectedOption: index < 6 ? q.answer : (q.answer + 1) % 4,
    }));

    const result = validateAndScoreSubmission(subject, chapter, answers);
    assert.equal(result.score, 6);
    assert.equal(result.totalQuestions, 10);
  });

  // Test 5: Rejects invalid question ID (e.g. from another subject/chapter or fake)
  it('5. invalid question ID throws 400 Bad Request', () => {
    const subject = 'physics';
    const chapter = 'kinematics';
    const authQuestions = questionBank[subject][chapter];

    const answers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));

    // Replace one questionId with an ID from chemistry
    answers[0].questionId = 'chem-atom-01';

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, answers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /does not belong to/i);
        return true;
      }
    );

    // Non-existent arbitrary ID
    answers[0].questionId = 'fake-random-id-999';
    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, answers),
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  // Test 6: Rejects duplicate question IDs
  it('6. duplicate question ID throws 400 Bad Request', () => {
    const subject = 'maths';
    const chapter = 'matrices';
    const authQuestions = questionBank[subject][chapter];

    const answers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));

    // Duplicate first question in place of second
    answers[1].questionId = answers[0].questionId;

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, answers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /duplicate question id/i);
        return true;
      }
    );
  });

  // Test 7: Rejects invalid option index (out of range, negative, or non-integer)
  it('7. invalid option index throws 400 Bad Request', () => {
    const subject = 'physics';
    const chapter = 'wpe';
    const authQuestions = questionBank[subject][chapter];

    // Out of bounds option index (e.g. 4 or 99 when options are 0..3)
    const outOfBoundsAnswers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));
    outOfBoundsAnswers[0].selectedOption = 4;

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, outOfBoundsAnswers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /out of range/i);
        return true;
      }
    );

    // Negative option index
    const negativeAnswers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));
    negativeAnswers[0].selectedOption = -2;

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, negativeAnswers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /out of range/i);
        return true;
      }
    );

    // Non-integer option
    const nonIntegerAnswers = authQuestions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));
    nonIntegerAnswers[0].selectedOption = "0";

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, nonIntegerAnswers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /must be an integer/i);
        return true;
      }
    );
  });

  // Test 8: Rejects incomplete/missing questions
  it('8. incomplete question submission throws 400 Bad Request', () => {
    const subject = 'physics';
    const chapter = 'rotational';
    const authQuestions = questionBank[subject][chapter];

    // Only submit 9 of 10 questions
    const incompleteAnswers = authQuestions.slice(0, 9).map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));

    assert.throws(
      () => validateAndScoreSubmission(subject, chapter, incompleteAnswers),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /must contain exactly 10 answers/i);
        return true;
      }
    );
  });

  // Test 9: Rejects malformed submission (null, missing subject/chapter, not array)
  it('9. malformed submission throws 400 Bad Request', () => {
    assert.throws(() => validateAndScoreSubmission(null, 'kinematics', []), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('physics', null, []), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('unknown_subject', 'kinematics', []), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('physics', 'unknown_chapter', []), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('physics', 'kinematics', null), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('physics', 'kinematics', {}), { statusCode: 400 });
    assert.throws(() => validateAndScoreSubmission('physics', 'kinematics', "not an array"), { statusCode: 400 });
  });

  // Test 10: Arbitrary client-supplied score & totalQuestions cannot influence stored/result score
  it('10. arbitrary client-supplied score and totalQuestions cannot tamper with server-derived result', async () => {
    const originalCreate = TestResult.create;
    let savedDocument = null;

    TestResult.create = async (doc) => {
      savedDocument = doc;
      return { _id: 'fake_id', ...doc, createdAt: new Date() };
    };

    try {
      const subject = 'maths';
      const chapter = 'quadraticequations';
      const authQuestions = questionBank[subject][chapter];

      // User answered only 3 questions correctly
      const answers = authQuestions.map((q, idx) => ({
        questionId: q.id,
        selectedOption: idx < 3 ? q.answer : (q.answer + 1) % 4,
      }));

      // Attacker sends arbitrary score 100 and totalQuestions 100 in body
      const req = {
        user: { id: 'user_123' },
        body: {
          subject,
          chapter,
          answers,
          score: 100, // Attacker tamper attempt
          totalQuestions: 100, // Attacker tamper attempt
        },
      };

      let responseStatus = null;
      let responseBody = null;
      const res = {
        status: (code) => {
          responseStatus = code;
          return res;
        },
        json: (payload) => {
          responseBody = payload;
          return res;
        },
      };

      await saveTestResult(req, res, () => {});

      assert.equal(responseStatus, 201);
      assert.equal(responseBody.success, true);
      assert.equal(responseBody.score, 3, 'Response score MUST be server-derived (3)');
      assert.equal(responseBody.totalQuestions, 10, 'Response totalQuestions MUST be server-derived (10)');
      assert.equal(savedDocument.score, 3, 'Saved DB score MUST be 3, ignoring client-sent 100');
      assert.equal(savedDocument.totalQuestions, 10, 'Saved DB totalQuestions MUST be 10, ignoring client-sent 100');
    } finally {
      TestResult.create = originalCreate;
    }
  });

  // Test 11: GET questions controller sanitizes output
  it('11. GET questions endpoint sanitizes output and returns 200 with totalQuestions', async () => {
    const req = {
      query: {
        subject: 'physics',
        chapter: 'kinematics',
      },
    };

    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return res;
      },
      json: (payload) => {
        responseBody = payload;
        return res;
      },
    };

    await getTestQuestions(req, res, () => {});

    assert.equal(responseStatus, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.questions.length, 10);
    assert.equal(responseBody.totalQuestions, 10);
    responseBody.questions.forEach((q) => {
      assert.equal(Object.prototype.hasOwnProperty.call(q, 'answer'), false);
    });
  });

  // Test 12: Valid complete submission produces accurate server-derived score across subjects
  it('12. valid complete submission produces correct server-derived score across all 12 chapters', () => {
    for (const subject of ['physics', 'chemistry', 'maths']) {
      const chapters = Object.keys(questionBank[subject]);
      for (const chapter of chapters) {
        const authQuestions = questionBank[subject][chapter];
        const answers = authQuestions.map((q, idx) => ({
          questionId: q.id,
          selectedOption: idx < 7 ? q.answer : (q.answer + 1) % 4, // 7 correct, 3 incorrect
        }));

        const result = validateAndScoreSubmission(subject, chapter, answers);
        assert.equal(result.score, 7);
        assert.equal(result.totalQuestions, 10);
      }
    }
  });

});
