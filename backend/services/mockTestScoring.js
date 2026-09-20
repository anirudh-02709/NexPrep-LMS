/**
 * Mock Test Scoring & Sanitization Service
 * Provides server-authoritative question sanitization, answer validation,
 * and flexible scoring supporting JEE Main marking (+4 / -1 / 0) and section analytics.
 */

/**
 * Strips sensitive answer keys from mock test questions.
 * Answer keys are NEVER transmitted to the client during testing.
 * 
 * @param {Array<object>} questions 
 * @returns {Array<{ id: string, section: string, chapter: string, q: string, options: string[] }>}
 */
function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions.map(({ id, section, chapter, q, options }) => ({
    id,
    section,
    chapter: chapter || '',
    q,
    options: [...options],
  }));
}

/**
 * Validates a student's answer submission against the authoritative MockTest definition
 * and calculates the server-authoritative score and section metrics.
 * 
 * @param {object} mockTest - Authoritative MockTest document
 * @param {Array<{ questionId: string, selectedOption: number }>} answers - Student submitted answers
 * @returns {object} Detailed score breakdown
 */
function validateAndScoreMockTest(mockTest, answers) {
  if (!mockTest || !Array.isArray(mockTest.questions) || mockTest.questions.length === 0) {
    const error = new Error('Invalid mock test definition.');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(answers)) {
    const error = new Error('Answers must be an array.');
    error.statusCode = 400;
    throw error;
  }

  const markingScheme = {
    correct: 4,
    incorrect: -1,
    unattempted: 0,
    ...(mockTest.markingScheme || {}),
  };

  const authMap = new Map();
  const sectionQuestionsCount = {};

  mockTest.questions.forEach((q) => {
    authMap.set(q.id, q);
    const sec = q.section ? q.section.toLowerCase() : 'default';
    sectionQuestionsCount[sec] = (sectionQuestionsCount[sec] || 0) + 1;
  });

  const answersMap = new Map();
  const seenIds = new Set();

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
      const error = new Error(`Question ID '${questionId}' does not belong to this mock test.`);
      error.statusCode = 400;
      throw error;
    }

    if (seenIds.has(questionId)) {
      const error = new Error(`Duplicate question ID '${questionId}' in answers.`);
      error.statusCode = 400;
      throw error;
    }

    seenIds.add(questionId);

    const authQuestion = authMap.get(questionId);

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
    }

    answersMap.set(questionId, selectedOption);
  }

  // Calculate score and section metrics
  let totalScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  const sectionScores = {};

  // Initialize section scores
  for (const sec in sectionQuestionsCount) {
    sectionScores[sec] = {
      score: 0,
      maxMarks: sectionQuestionsCount[sec] * markingScheme.correct,
      totalQuestions: sectionQuestionsCount[sec],
      correctCount: 0,
      incorrectCount: 0,
      unattemptedCount: 0,
    };
  }

  // Process all authoritative questions
  mockTest.questions.forEach((authQ) => {
    const sec = authQ.section ? authQ.section.toLowerCase() : 'default';
    if (!sectionScores[sec]) {
      sectionScores[sec] = {
        score: 0,
        maxMarks: 0,
        totalQuestions: 0,
        correctCount: 0,
        incorrectCount: 0,
        unattemptedCount: 0,
      };
    }

    const selectedOption = answersMap.has(authQ.id) ? answersMap.get(authQ.id) : -1;
    const isAttempted = selectedOption !== null && selectedOption !== undefined && selectedOption !== -1;

    if (!isAttempted) {
      unattemptedCount++;
      totalScore += markingScheme.unattempted;
      sectionScores[sec].unattemptedCount++;
      sectionScores[sec].score += markingScheme.unattempted;
    } else if (selectedOption === authQ.answer) {
      correctCount++;
      totalScore += markingScheme.correct;
      sectionScores[sec].correctCount++;
      sectionScores[sec].score += markingScheme.correct;
    } else {
      incorrectCount++;
      totalScore += markingScheme.incorrect;
      sectionScores[sec].incorrectCount++;
      sectionScores[sec].score += markingScheme.incorrect;
    }
  });

  const totalQuestions = mockTest.questions.length;
  const maxMarks = totalQuestions * markingScheme.correct;
  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const percentage = maxMarks > 0 ? Math.round((Math.max(0, totalScore) / maxMarks) * 100) : 0;

  return {
    score: totalScore,
    maxMarks,
    totalQuestions,
    correctCount,
    incorrectCount,
    unattemptedCount,
    accuracy,
    percentage,
    sectionScores,
  };
}

/**
 * Builds post-exam question review payload for a completed session.
 * Includes student's selection and correct answer.
 * 
 * @param {object} mockTest 
 * @param {Array<object>} answers 
 * @returns {Array<object>}
 */
function buildQuestionReview(mockTest, answers) {
  const answerLookup = new Map();
  (answers || []).forEach((a) => {
    answerLookup.set(a.questionId, a.selectedOption);
  });

  return mockTest.questions.map((q) => {
    const userOption = answerLookup.has(q.id) ? answerLookup.get(q.id) : -1;
    const isAttempted = userOption !== -1 && userOption !== null && userOption !== undefined;
    const isCorrect = isAttempted && userOption === q.answer;

    return {
      id: q.id,
      section: q.section,
      chapter: q.chapter,
      q: q.q,
      options: [...q.options],
      userSelectedOption: userOption,
      correctAnswer: q.answer,
      isAttempted,
      isCorrect,
    };
  });
}

module.exports = {
  sanitizeQuestions,
  validateAndScoreMockTest,
  buildQuestionReview,
};
