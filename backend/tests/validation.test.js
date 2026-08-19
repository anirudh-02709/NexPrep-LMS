const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TAXONOMY,
  ALL_SUBJECTS,
  ALL_CHAPTERS,
  isValidSubject,
  isValidChapter,
  validateSubjectAndChapter,
} = require('../data/taxonomy');
const { getSanitizedQuestions, validateAndScoreSubmission } = require('../services/testScoring');
const { updateProgress, getChapterStatus } = require('../controllers/progressController');
const TestResult = require('../models/TestResult');
const Progress = require('../models/Progress');

describe('Taxonomy & Input Validation Suite', () => {

  // 1. Valid subject / chapter combinations
  it('1. accepts all valid subject and chapter combinations in taxonomy', () => {
    for (const subject of ALL_SUBJECTS) {
      assert.equal(isValidSubject(subject), true);
      assert.equal(isValidSubject(subject.toUpperCase()), true); // Case-insensitive
      
      const chapters = TAXONOMY[subject];
      for (const chapter of chapters) {
        assert.equal(isValidChapter(subject, chapter), true);
        const validated = validateSubjectAndChapter(subject, chapter);
        assert.equal(validated.subject, subject);
        assert.equal(validated.chapter, chapter);
      }
    }
  });

  // 2. Invalid subject
  it('2. rejects invalid subjects with 400 error', () => {
    const invalidSubjects = ['biology', 'history', 'computer_science', 'random123', ''];
    for (const invalid of invalidSubjects) {
      assert.equal(isValidSubject(invalid), false);
      assert.throws(
        () => validateSubjectAndChapter(invalid, 'kinematics'),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
  });

  // 3. Invalid chapter
  it('3. rejects invalid chapters with 400 error', () => {
    const invalidChapters = ['non_existent_chapter', 'algebra_99', 'quantum_mechanics_xyz', ''];
    for (const invalid of invalidChapters) {
      assert.equal(isValidChapter('physics', invalid), false);
      assert.throws(
        () => validateSubjectAndChapter('physics', invalid),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
  });

  // 4. Invalid subject/chapter combination (e.g. physics subject with chemistry chapter)
  it('4. rejects mismatched subject and chapter combinations with 400 error', () => {
    // 'atomicstructure' is valid chemistry, but invalid for physics
    assert.equal(isValidChapter('physics', 'atomicstructure'), false);
    assert.throws(
      () => validateSubjectAndChapter('physics', 'atomicstructure'),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /invalid chapter 'atomicstructure' for subject 'physics'/i);
        return true;
      }
    );

    // 'kinematics' is valid physics, but invalid for maths
    assert.equal(isValidChapter('maths', 'kinematics'), false);
    assert.throws(
      () => validateSubjectAndChapter('maths', 'kinematics'),
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  // 5. XSS payloads in subject/chapter
  it('5. strictly rejects XSS payloads supplied as subject or chapter with 400 error', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg/onload=alert(1)>',
      "javascript:alert('xss')",
      "' OR 1=1 --",
      '{{7*7}}',
    ];

    for (const payload of xssPayloads) {
      // In subject
      assert.equal(isValidSubject(payload), false);
      assert.throws(
        () => validateSubjectAndChapter(payload, 'kinematics'),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      // In chapter
      assert.equal(isValidChapter('physics', payload), false);
      assert.throws(
        () => validateSubjectAndChapter('physics', payload),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      // In getSanitizedQuestions
      assert.throws(() => getSanitizedQuestions(payload, 'kinematics'), { statusCode: 400 });
      assert.throws(() => getSanitizedQuestions('physics', payload), { statusCode: 400 });

      // In validateAndScoreSubmission
      assert.throws(() => validateAndScoreSubmission(payload, 'kinematics', []), { statusCode: 400 });
      assert.throws(() => validateAndScoreSubmission('physics', payload, []), { statusCode: 400 });
    }
  });

  // 6. TestResult Model Validation: Negative score rejection
  it('6. TestResult model rejects negative score', () => {
    const testResult = new TestResult({
      user: '507f1f77bcf86cd799439011',
      subject: 'physics',
      chapter: 'kinematics',
      score: -1,
      totalQuestions: 10,
    });

    const err = testResult.validateSync();
    assert.ok(err, 'Expected validation error for negative score');
    assert.ok(err.errors['score']);
  });

  // 7. TestResult Model Validation: Score > totalQuestions rejection
  it('7. TestResult model rejects score exceeding totalQuestions', () => {
    const testResult = new TestResult({
      user: '507f1f77bcf86cd799439011',
      subject: 'physics',
      chapter: 'kinematics',
      score: 15,
      totalQuestions: 10,
    });

    const err = testResult.validateSync();
    assert.ok(err, 'Expected validation error when score > totalQuestions');
    assert.ok(err.errors['score']);
    assert.match(err.errors['score'].message, /cannot exceed total questions/i);
  });

  // 8. TestResult Model Validation: Non-integer numeric fields
  it('8. TestResult model rejects non-integer score and totalQuestions', () => {
    const floatScoreResult = new TestResult({
      user: '507f1f77bcf86cd799439011',
      subject: 'physics',
      chapter: 'kinematics',
      score: 7.5,
      totalQuestions: 10,
    });

    const floatScoreErr = floatScoreResult.validateSync();
    assert.ok(floatScoreErr);
    assert.ok(floatScoreErr.errors['score']);

    const floatTotalResult = new TestResult({
      user: '507f1f77bcf86cd799439011',
      subject: 'physics',
      chapter: 'kinematics',
      score: 5,
      totalQuestions: 10.5,
    });

    const floatTotalErr = floatTotalResult.validateSync();
    assert.ok(floatTotalErr);
    assert.ok(floatTotalErr.errors['totalQuestions']);
  });

  // 9. TestResult Model Validation: Invalid subject/chapter enums
  it('9. TestResult model rejects subjects/chapters not in taxonomy enum', () => {
    const invalidResult = new TestResult({
      user: '507f1f77bcf86cd799439011',
      subject: '<script>alert(1)</script>',
      chapter: 'kinematics',
      score: 5,
      totalQuestions: 10,
    });

    const err = invalidResult.validateSync();
    assert.ok(err);
    assert.ok(err.errors['subject']);
  });

  // 10. Progress Model Validation: Invalid subject/chapter enums
  it('10. Progress model rejects subjects/chapters not in taxonomy enum', () => {
    const invalidProgress = new Progress({
      user: '507f1f77bcf86cd799439011',
      subject: 'invalid_subject',
      chapter: 'kinematics',
    });

    const err = invalidProgress.validateSync();
    assert.ok(err);
    assert.ok(err.errors['subject']);
  });

  // 11. Progress Controller: updateProgress rejects invalid subject or chapter
  it('11. updateProgress controller rejects unknown subject/chapter with HTTP 400', async () => {
    const req = {
      user: { id: 'user_123' },
      body: {
        subject: '<script>alert("xss")</script>',
        chapter: 'kinematics',
      },
    };

    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
      json: () => res,
    };
    const next = (err) => {
      nextError = err;
    };

    await updateProgress(req, res, next);
    assert.equal(statusCalled, 400);
    assert.ok(nextError);
    assert.match(nextError.message, /invalid subject/i);
  });

  // 12. Progress Controller: getChapterStatus rejects invalid query parameters
  it('12. getChapterStatus controller rejects unknown query parameters with HTTP 400', async () => {
    const req = {
      user: { id: 'user_123' },
      query: {
        subject: 'physics',
        chapter: 'fake_chapter_123',
      },
    };

    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
      json: () => res,
    };
    const next = (err) => {
      nextError = err;
    };

    await getChapterStatus(req, res, next);
    assert.equal(statusCalled, 400);
    assert.ok(nextError);
    assert.match(nextError.message, /invalid chapter/i);
  });

});
