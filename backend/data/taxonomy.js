// Authoritative Taxonomy for NexPrep LMS
// Defines all allowed subjects and their associated chapters.

const TAXONOMY = {
  physics: ['kinematics', 'nlm', 'wpe', 'rotational'],
  chemistry: ['atomicstructure', 'chemicalbonding', 'thermodynamics', 'electrochemistry'],
  maths: ['quadraticequations', 'sequences', 'limits', 'matrices'],
};

const ALL_SUBJECTS = Object.freeze(Object.keys(TAXONOMY));

const ALL_CHAPTERS = Object.freeze(
  Object.values(TAXONOMY).reduce((acc, chapters) => acc.concat(chapters), [])
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

module.exports = {
  TAXONOMY,
  ALL_SUBJECTS,
  ALL_CHAPTERS,
  isValidSubject,
  isValidChapter,
  validateSubjectAndChapter,
};
