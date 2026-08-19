const questionBank = require('../data/questionBank');
const { validateSubjectAndChapter } = require('../data/taxonomy');

/**
 * Retrieves sanitized question data for a given subject and chapter.
 * Strictly omits correct answer keys.
 * 
 * @param {string} subject 
 * @param {string} chapter 
 * @returns {Array<{ id: string, q: string, options: string[] }>}
 */
const getSanitizedQuestions = (subject, chapter) => {
  const validated = validateSubjectAndChapter(subject, chapter);

  const questions = questionBank[validated.subject][validated.chapter];
  if (!questions) {
    const error = new Error(`No questions available for '${validated.subject}/${validated.chapter}'.`);
    error.statusCode = 400;
    throw error;
  }

  return questions.map(({ id, q, options }) => ({
    id,
    q,
    options: [...options],
  }));
};

/**
 * Validates a client test submission against authoritative backend data
 * and computes the authoritative score.
 * 
 * @param {string} subject 
 * @param {string} chapter 
 * @param {Array<{ questionId: string, selectedOption: number }>} answers 
 * @returns {{ score: number, totalQuestions: number }}
 */
const validateAndScoreSubmission = (subject, chapter, answers) => {
  const validated = validateSubjectAndChapter(subject, chapter);

  const authoritativeQuestions = questionBank[validated.subject][validated.chapter];
  if (!authoritativeQuestions) {
    const error = new Error(`No question bank found for '${validated.subject}/${validated.chapter}'.`);
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    const error = new Error('Answers must be a non-empty array.');
    error.statusCode = 400;
    throw error;
  }

  const totalQuestions = authoritativeQuestions.length;

  if (answers.length !== totalQuestions) {
    const error = new Error(`Submission must contain exactly ${totalQuestions} answers, received ${answers.length}.`);
    error.statusCode = 400;
    throw error;
  }

  const authMap = new Map();
  authoritativeQuestions.forEach((q) => {
    authMap.set(q.id, q);
  });

  const seenIds = new Set();
  let score = 0;

  for (let i = 0; i < answers.length; i++) {
    const item = answers[i];

    if (!item || typeof item !== 'object') {
      const error = new Error(`Malformed answer item at index ${i}.`);
      error.statusCode = 400;
      throw error;
    }

    const { questionId, selectedOption } = item;

    if (!questionId || typeof questionId !== 'string') {
      const error = new Error(`Invalid or missing questionId at index ${i}.`);
      error.statusCode = 400;
      throw error;
    }

    if (!authMap.has(questionId)) {
      const error = new Error(`Question ID '${questionId}' does not belong to ${validated.subject}/${validated.chapter}.`);
      error.statusCode = 400;
      throw error;
    }

    if (seenIds.has(questionId)) {
      const error = new Error(`Duplicate question ID '${questionId}' in submission.`);
      error.statusCode = 400;
      throw error;
    }

    seenIds.add(questionId);
    const authQuestion = authMap.get(questionId);

    // Selected option validation: integer in [0, options.length - 1], or -1 / null for unanswered
    if (selectedOption !== null && selectedOption !== undefined && selectedOption !== -1) {
      if (!Number.isInteger(selectedOption)) {
        const error = new Error(`selectedOption for question '${questionId}' must be an integer.`);
        error.statusCode = 400;
        throw error;
      }

      if (selectedOption < 0 || selectedOption >= authQuestion.options.length) {
        const error = new Error(
          `selectedOption ${selectedOption} for question '${questionId}' is out of range [0, ${authQuestion.options.length - 1}].`
        );
        error.statusCode = 400;
        throw error;
      }

      if (selectedOption === authQuestion.answer) {
        score++;
      }
    }
  }

  // Ensure every authoritative question was answered in the submission
  if (seenIds.size !== totalQuestions) {
    const error = new Error('Submission is missing required questions for this test.');
    error.statusCode = 400;
    throw error;
  }

  return {
    score,
    totalQuestions,
  };
};

module.exports = {
  getSanitizedQuestions,
  validateAndScoreSubmission,
};
