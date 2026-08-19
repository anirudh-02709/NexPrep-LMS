const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TAXONOMY_DATA,
  TAXONOMY,
  ALL_SUBJECTS,
  ALL_CHAPTERS,
  CHAPTER_NAMES,
  SUBJECT_NAMES,
  CHAPTER_TO_SUBJECT,
  isValidSubject,
  isValidChapter,
  validateSubjectAndChapter,
  getChapterTitle,
  getSubjectTitle,
  getChapterSubject,
  getSubjectChapters,
} = require('../data/taxonomy');

const questionBank = require('../data/questionBank');
const { generateContent } = require('../scripts/buildTaxonomy');

describe('Canonical Single-Source Taxonomy Suite', () => {

  // 1. Canonical Taxonomy Data Integrity
  it('1. TAXONOMY_DATA contains all 3 subjects with exact 4 chapters each', () => {
    assert.deepEqual(Object.keys(TAXONOMY_DATA), ['physics', 'chemistry', 'maths']);
    assert.equal(TAXONOMY_DATA.physics.chapters.length, 4);
    assert.equal(TAXONOMY_DATA.chemistry.chapters.length, 4);
    assert.equal(TAXONOMY_DATA.maths.chapters.length, 4);
  });

  // 2. Derived data structures correctness
  it('2. derived structures correctly map all subjects and chapters', () => {
    assert.deepEqual(ALL_SUBJECTS, ['physics', 'chemistry', 'maths']);
    assert.equal(ALL_CHAPTERS.length, 12);
    assert.equal(Object.keys(CHAPTER_NAMES).length, 12);
    assert.equal(Object.keys(SUBJECT_NAMES).length, 3);
    assert.equal(Object.keys(CHAPTER_TO_SUBJECT).length, 12);

    // Verify exact expected mapping
    assert.equal(CHAPTER_NAMES.kinematics, 'Kinematics');
    assert.equal(CHAPTER_NAMES.nlm, "Newton's Laws");
    assert.equal(CHAPTER_NAMES.wpe, 'Work Power Energy');
    assert.equal(CHAPTER_NAMES.rotational, 'Rotational Motion');

    assert.equal(CHAPTER_TO_SUBJECT.kinematics, 'physics');
    assert.equal(CHAPTER_TO_SUBJECT.atomicstructure, 'chemistry');
    assert.equal(CHAPTER_TO_SUBJECT.quadraticequations, 'maths');
  });

  // 3. Helper functions
  it('3. helper functions return correct display titles and parent subjects', () => {
    assert.equal(getChapterTitle('kinematics'), 'Kinematics');
    assert.equal(getChapterTitle('unknown_ch'), 'unknown_ch');

    assert.equal(getSubjectTitle('physics'), 'Physics');
    assert.equal(getSubjectTitle('chemistry'), 'Chemistry');
    assert.equal(getSubjectTitle('maths'), 'Maths');

    assert.equal(getChapterSubject('nlm'), 'physics');
    assert.equal(getChapterSubject('thermodynamics'), 'chemistry');
    assert.equal(getChapterSubject('matrices'), 'maths');
    assert.equal(getChapterSubject('nonexistent'), undefined);

    const physicsChapters = getSubjectChapters('physics');
    assert.equal(physicsChapters.length, 4);
    assert.equal(physicsChapters[0].id, 'kinematics');
    assert.equal(physicsChapters[0].name, 'Kinematics');
  });

  // 4. Question Bank covers all taxonomy chapters
  it('4. questionBank has authoritative entries matching 100% of taxonomy chapters', () => {
    ALL_SUBJECTS.forEach((subject) => {
      assert.ok(questionBank[subject], `Missing subject '${subject}' in questionBank`);
      TAXONOMY[subject].forEach((chapter) => {
        assert.ok(
          Array.isArray(questionBank[subject][chapter]),
          `Missing or invalid chapter '${chapter}' for subject '${subject}' in questionBank`
        );
        assert.equal(
          questionBank[subject][chapter].length,
          10,
          `Chapter '${subject}/${chapter}' must have exactly 10 questions`
        );
      });
    });
  });

  // 5. Taxonomy validation accepts valid combinations and rejects invalid
  it('5. validateSubjectAndChapter enforces single source of truth rules', () => {
    const valid = validateSubjectAndChapter('Physics', 'Kinematics');
    assert.deepEqual(valid, { subject: 'physics', chapter: 'kinematics' });

    // Invalid subject
    assert.throws(() => validateSubjectAndChapter('biology', 'genetics'), {
      statusCode: 400,
    });

    // Mismatched chapter
    assert.throws(() => validateSubjectAndChapter('physics', 'matrices'), {
      statusCode: 400,
    });
  });

  // 6. Generated frontend taxonomy script produces valid code
  it('6. generateContent generates valid JS with all necessary globals', () => {
    const code = generateContent();
    assert.ok(code.includes('const TAXONOMY_DATA ='));
    assert.ok(code.includes('const CHAPTER_NAMES ='));
    assert.ok(code.includes('function getChapterTitle'));
    assert.ok(code.includes('function getSubjectChapters'));

    // Execute in sandbox to ensure valid JS syntax and evaluate exports
    const vm = require('vm');
    const sandbox = {};
    vm.createContext(sandbox);
    const result = vm.runInContext(
      code + '\n;({ TAXONOMY_DATA, getChapterTitle, getChapterSubject, getSubjectChapters });',
      sandbox
    );

    assert.ok(result.TAXONOMY_DATA);
    assert.equal(result.getChapterTitle('kinematics'), 'Kinematics');
    assert.equal(result.getChapterSubject('thermodynamics'), 'chemistry');
    assert.equal(result.getSubjectChapters('maths').length, 4);
  });

});
