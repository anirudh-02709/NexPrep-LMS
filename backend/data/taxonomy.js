// Authoritative Canonical Taxonomy for NexPrep LMS
// Defines all subjects, display names, and their associated chapters.

const TAXONOMY_DATA = Object.freeze({
  physics: {
    displayName: 'Physics',
    chapters: [
      { id: 'kinematics', name: 'Kinematics' },
      { id: 'nlm', name: "Newton's Laws" },
      { id: 'wpe', name: 'Work Power Energy' },
      { id: 'rotational', name: 'Rotational Motion' },
    ],
  },
  chemistry: {
    displayName: 'Chemistry',
    chapters: [
      { id: 'atomicstructure', name: 'Atomic Structure' },
      { id: 'chemicalbonding', name: 'Chemical Bonding' },
      { id: 'thermodynamics', name: 'Thermodynamics' },
      { id: 'electrochemistry', name: 'Electrochemistry' },
    ],
  },
  maths: {
    displayName: 'Maths',
    chapters: [
      { id: 'quadraticequations', name: 'Quadratic Equations' },
      { id: 'sequences', name: 'Sequences & Series' },
      { id: 'limits', name: 'Limits & Derivatives' },
      { id: 'matrices', name: 'Matrices' },
    ],
  },
});

// Derived Data Structures
const ALL_SUBJECTS = Object.freeze(Object.keys(TAXONOMY_DATA));

const TAXONOMY = Object.freeze(
  ALL_SUBJECTS.reduce((acc, subjectKey) => {
    acc[subjectKey] = TAXONOMY_DATA[subjectKey].chapters.map((ch) => ch.id);
    return acc;
  }, {})
);

const ALL_CHAPTERS = Object.freeze(
  Object.values(TAXONOMY).reduce((acc, chapters) => acc.concat(chapters), [])
);

const CHAPTER_NAMES = Object.freeze(
  ALL_SUBJECTS.reduce((acc, subjectKey) => {
    TAXONOMY_DATA[subjectKey].chapters.forEach((ch) => {
      acc[ch.id] = ch.name;
    });
    return acc;
  }, {})
);

const SUBJECT_NAMES = Object.freeze(
  ALL_SUBJECTS.reduce((acc, subjectKey) => {
    acc[subjectKey] = TAXONOMY_DATA[subjectKey].displayName;
    return acc;
  }, {})
);

const CHAPTER_TO_SUBJECT = Object.freeze(
  ALL_SUBJECTS.reduce((acc, subjectKey) => {
    TAXONOMY_DATA[subjectKey].chapters.forEach((ch) => {
      acc[ch.id] = subjectKey;
    });
    return acc;
  }, {})
);

/**
 * Checks if a subject string is a valid known subject.
 * @param {any} subject 
 * @returns {boolean}
 */
const isValidSubject = (subject) => {
  if (typeof subject !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(TAXONOMY, subject.toLowerCase().trim());
};

/**
 * Checks if a chapter string belongs to the specified subject.
 * @param {any} subject 
 * @param {any} chapter 
 * @returns {boolean}
 */
const isValidChapter = (subject, chapter) => {
  if (typeof subject !== 'string' || typeof chapter !== 'string') return false;
  const s = subject.toLowerCase().trim();
  const c = chapter.toLowerCase().trim();
  return isValidSubject(s) && TAXONOMY[s].includes(c);
};

/**
 * Validates subject and chapter parameters.
 * Returns normalized lowercase strings if valid, throws an Error with statusCode 400 otherwise.
 * @param {any} subject 
 * @param {any} chapter 
 * @returns {{ subject: string, chapter: string }}
 */
const validateSubjectAndChapter = (subject, chapter) => {
  if (!subject || typeof subject !== 'string' || !chapter || typeof chapter !== 'string') {
    const error = new Error('Please provide a valid subject and chapter.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedSubject = subject.toLowerCase().trim();
  const normalizedChapter = chapter.toLowerCase().trim();

  if (!isValidSubject(normalizedSubject)) {
    const error = new Error(`Invalid subject: '${subject}'.`);
    error.statusCode = 400;
    throw error;
  }

  if (!TAXONOMY[normalizedSubject].includes(normalizedChapter)) {
    const error = new Error(`Invalid chapter '${chapter}' for subject '${subject}'.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    subject: normalizedSubject,
    chapter: normalizedChapter,
  };
};

/**
 * Gets display title of a chapter by ID.
 * @param {string} chapterId 
 * @returns {string}
 */
const getChapterTitle = (chapterId) => {
  return CHAPTER_NAMES[chapterId] || chapterId;
};

/**
 * Gets display title of a subject by key.
 * @param {string} subjectKey 
 * @returns {string}
 */
const getSubjectTitle = (subjectKey) => {
  return SUBJECT_NAMES[subjectKey] || subjectKey;
};

/**
 * Gets parent subject for a given chapter ID.
 * @param {string} chapterId 
 * @returns {string|undefined}
 */
const getChapterSubject = (chapterId) => {
  return CHAPTER_TO_SUBJECT[chapterId];
};

/**
 * Gets all chapter objects for a given subject.
 * @param {string} subjectKey 
 * @returns {Array<{ id: string, name: string }>}
 */
const getSubjectChapters = (subjectKey) => {
  if (!isValidSubject(subjectKey)) return [];
  return [...TAXONOMY_DATA[subjectKey.toLowerCase().trim()].chapters];
};

module.exports = {
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
};
