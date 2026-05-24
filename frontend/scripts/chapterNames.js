const CHAPTER_NAMES = {
  kinematics: 'Kinematics',
  nlm: "Newton's Laws",
  wpe: 'Work Power Energy',
  rotational: 'Rotational Motion',
  atomicstructure: 'Atomic Structure',
  chemicalbonding: 'Chemical Bonding',
  thermodynamics: 'Thermodynamics',
  electrochemistry: 'Electrochemistry',
  quadraticequations: 'Quadratic Equations',
  sequences: 'Sequences & Series',
  limits: 'Limits & Derivatives',
  matrices: 'Matrices',
};

const SUBJECT_NAMES = {
  physics: 'Physics',
  chemistry: 'Chemistry',
  maths: 'Maths',
};

function getChapterTitle(chapter) {
  return CHAPTER_NAMES[chapter] || chapter;
}

function getSubjectTitle(subject) {
  return SUBJECT_NAMES[subject] || subject;
}
