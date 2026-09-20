const questionBank = require('./questionBank');

/**
 * Generates the representative JEE Main Practice Mock Test definition
 * using existing canonical questions across Physics, Chemistry, and Mathematics.
 * 
 * Configured as 30 questions (10 per subject), 60 minutes, 120 marks (+4/-1).
 * Architectural note: MockTest model supports arbitrary question counts and durations.
 */
function buildRepresentativeMockTest() {
  const sections = [
    {
      id: 'physics',
      name: 'Physics',
      totalQuestions: 10,
      instructions: 'Section 1 contains 10 Physics questions. +4 marks for correct, -1 mark for incorrect.',
    },
    {
      id: 'chemistry',
      name: 'Chemistry',
      totalQuestions: 10,
      instructions: 'Section 2 contains 10 Chemistry questions. +4 marks for correct, -1 mark for incorrect.',
    },
    {
      id: 'maths',
      name: 'Mathematics',
      totalQuestions: 10,
      instructions: 'Section 3 contains 10 Mathematics questions. +4 marks for correct, -1 mark for incorrect.',
    },
  ];

  // Pick representative questions from each chapter
  const physicsQuestions = [
    { ...questionBank.physics.kinematics[0], section: 'physics', chapter: 'kinematics' },
    { ...questionBank.physics.kinematics[1], section: 'physics', chapter: 'kinematics' },
    { ...questionBank.physics.kinematics[2], section: 'physics', chapter: 'kinematics' },
    { ...questionBank.physics.nlm[0], section: 'physics', chapter: 'nlm' },
    { ...questionBank.physics.nlm[1], section: 'physics', chapter: 'nlm' },
    { ...questionBank.physics.wpe[0], section: 'physics', chapter: 'wpe' },
    { ...questionBank.physics.wpe[2], section: 'physics', chapter: 'wpe' },
    { ...questionBank.physics.rotational[0], section: 'physics', chapter: 'rotational' },
    { ...questionBank.physics.rotational[1], section: 'physics', chapter: 'rotational' },
    { ...questionBank.physics.rotational[2], section: 'physics', chapter: 'rotational' },
  ];

  const chemistryQuestions = [
    { ...questionBank.chemistry.atomicstructure[0], section: 'chemistry', chapter: 'atomicstructure' },
    { ...questionBank.chemistry.atomicstructure[1], section: 'chemistry', chapter: 'atomicstructure' },
    { ...questionBank.chemistry.atomicstructure[3], section: 'chemistry', chapter: 'atomicstructure' },
    { ...questionBank.chemistry.chemicalbonding[0], section: 'chemistry', chapter: 'chemicalbonding' },
    { ...questionBank.chemistry.chemicalbonding[1], section: 'chemistry', chapter: 'chemicalbonding' },
    { ...questionBank.chemistry.thermodynamics[0], section: 'chemistry', chapter: 'thermodynamics' },
    { ...questionBank.chemistry.thermodynamics[1], section: 'chemistry', chapter: 'thermodynamics' },
    { ...questionBank.chemistry.thermodynamics[4], section: 'chemistry', chapter: 'thermodynamics' },
    { ...questionBank.chemistry.electrochemistry[0], section: 'chemistry', chapter: 'electrochemistry' },
    { ...questionBank.chemistry.electrochemistry[2], section: 'chemistry', chapter: 'electrochemistry' },
  ];

  const mathsQuestions = [
    { ...questionBank.maths.quadraticequations[0], section: 'maths', chapter: 'quadraticequations' },
    { ...questionBank.maths.quadraticequations[1], section: 'maths', chapter: 'quadraticequations' },
    { ...questionBank.maths.quadraticequations[4], section: 'maths', chapter: 'quadraticequations' },
    { ...questionBank.maths.sequences[0], section: 'maths', chapter: 'sequences' },
    { ...questionBank.maths.sequences[1], section: 'maths', chapter: 'sequences' },
    { ...questionBank.maths.limits[0], section: 'maths', chapter: 'limits' },
    { ...questionBank.maths.limits[2], section: 'maths', chapter: 'limits' },
    { ...questionBank.maths.limits[3], section: 'maths', chapter: 'limits' },
    { ...questionBank.maths.matrices[0], section: 'maths', chapter: 'matrices' },
    { ...questionBank.maths.matrices[2], section: 'maths', chapter: 'matrices' },
  ];

  const questions = [
    ...physicsQuestions,
    ...chemistryQuestions,
    ...mathsQuestions,
  ].map((q) => ({
    id: q.id,
    section: q.section,
    chapter: q.chapter,
    q: q.q,
    options: [...q.options],
    answer: q.answer, // Kept server-side only!
  }));

  return {
    title: 'JEE Main Practice Mock Test 1',
    slug: 'jee-main-mock-1',
    type: 'jee_mock',
    description:
      'Representative JEE Main mock exam covering core concepts across Physics, Chemistry, and Mathematics with standard sectional navigation and +4/-1 marking.',
    duration: 60, // 60 minutes
    totalQuestions: questions.length, // 30
    totalMarks: questions.length * 4, // 120 marks
    markingScheme: {
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    },
    sections,
    questions,
    active: true,
  };
}

/**
 * Ensures the default representative mock test exists in the database.
 * If not present, creates it.
 * 
 * @param {import('mongoose').Model} MockTestModel 
 */
async function ensureSeedMockTests(MockTestModel) {
  try {
    const existing = await MockTestModel.findOne({ slug: 'jee-main-mock-1' });
    if (!existing) {
      const seedData = buildRepresentativeMockTest();
      await MockTestModel.create(seedData);
      return true;
    }
    return false;
  } catch (error) {
    // If running in an environment where DB is mocked or disconnected, fail gracefully
    return false;
  }
}

module.exports = {
  buildRepresentativeMockTest,
  ensureSeedMockTests,
};
