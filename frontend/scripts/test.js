// ─── Question Bank ───────────────────────────────────────
const questionBank = {
  physics: {
    kinematics: [
      { q: "A body is said to be in uniform motion if it travels:", options: ["Equal distances in equal time intervals", "Unequal distances in equal time intervals", "With increasing speed", "With decreasing speed"], answer: 0 },
      { q: "Which of the following is a vector quantity?", options: ["Speed", "Distance", "Velocity", "Mass"], answer: 2 },
      { q: "The slope of a displacement-time graph gives:", options: ["Acceleration", "Velocity", "Force", "Distance"], answer: 1 },
      { q: "A car accelerates from 0 to 20 m/s in 4 seconds. Its acceleration is:", options: ["5 m/s²", "80 m/s²", "0.2 m/s²", "4 m/s²"], answer: 0 },
      { q: "The area under a velocity-time graph gives:", options: ["Speed", "Acceleration", "Displacement", "Force"], answer: 2 },
      { q: "Which equation of motion is correct?", options: ["v = u - at", "v² = u² + 2as", "s = ut + at²", "v = u + 2at"], answer: 1 },
      { q: "A ball is thrown vertically upward. At the highest point:", options: ["velocity is max", "acceleration is zero", "velocity is zero", "both velocity and acceleration are zero"], answer: 2 },
      { q: "Relative velocity of two objects moving in same direction with speeds v1 and v2 (v1 > v2) is:", options: ["v1 + v2", "v1 - v2", "v1 × v2", "v1 / v2"], answer: 1 },
      { q: "The unit of acceleration is:", options: ["m/s", "m/s²", "ms", "m²/s"], answer: 1 },
      { q: "A particle moves in a circle. The displacement after half revolution of radius r is:", options: ["πr", "2r", "2πr", "r"], answer: 1 }
    ],
    nlm: [
      { q: "Newton's first law of motion is also called:", options: ["Law of acceleration", "Law of inertia", "Law of action-reaction", "Law of gravitation"], answer: 1 },
      { q: "The SI unit of force is:", options: ["Dyne", "Newton", "Joule", "Pascal"], answer: 1 },
      { q: "A body of mass 5 kg is acted upon by a force of 20 N. Its acceleration is:", options: ["100 m/s²", "0.25 m/s²", "4 m/s²", "25 m/s²"], answer: 2 },
      { q: "Action and reaction forces act on:", options: ["Same body", "Different bodies", "Same line only", "None of these"], answer: 1 },
      { q: "Inertia of a body depends on:", options: ["Velocity", "Acceleration", "Mass", "Shape"], answer: 2 },
      { q: "A book on a table. The reaction to the book's weight acts on:", options: ["Table from ground", "Earth from book", "Book from table", "Air around book"], answer: 1 },
      { q: "If net force on a body is zero, the body:", options: ["Must be at rest", "Must be moving", "Cannot accelerate", "Must decelerate"], answer: 2 },
      { q: "The force that opposes relative motion between surfaces is:", options: ["Gravity", "Friction", "Normal force", "Tension"], answer: 1 },
      { q: "A 10 kg object on a frictionless surface is pushed with 50 N. Acceleration is:", options: ["500 m/s²", "0.2 m/s²", "5 m/s²", "10 m/s²"], answer: 2 },
      { q: "Which law explains why we lean back when a bus accelerates suddenly?", options: ["Newton's 3rd law", "Newton's 2nd law", "Newton's 1st law", "Law of gravitation"], answer: 2 }
    ],
    wpe: [
      { q: "Work done is zero when force and displacement are:", options: ["Parallel", "Anti-parallel", "Perpendicular", "Equal"], answer: 2 },
      { q: "The SI unit of energy is:", options: ["Watt", "Newton", "Joule", "Pascal"], answer: 2 },
      { q: "Kinetic energy of a body of mass m moving with velocity v is:", options: ["mv", "mv²", "½mv²", "2mv²"], answer: 2 },
      { q: "Power is defined as:", options: ["Force × displacement", "Work / time", "Energy × time", "Force / time"], answer: 1 },
      { q: "A body is lifted 2m with a force of 10 N. Work done is:", options: ["5 J", "20 J", "12 J", "0 J"], answer: 1 },
      { q: "Which energy does a stretched spring possess?", options: ["Kinetic energy", "Gravitational PE", "Elastic PE", "Heat energy"], answer: 2 },
      { q: "When a ball falls freely, which stays constant (ignoring air)?", options: ["KE", "PE", "Speed", "Total mechanical energy"], answer: 3 },
      { q: "The work-energy theorem states that net work = change in:", options: ["Potential energy", "Kinetic energy", "Momentum", "Power"], answer: 1 },
      { q: "1 horsepower is equal to:", options: ["100 W", "746 W", "1000 W", "500 W"], answer: 1 },
      { q: "A machine does 500 J of work in 5 seconds. Its power is:", options: ["2500 W", "100 W", "50 W", "505 W"], answer: 1 }
    ],
    rotational: [
      { q: "The moment of inertia depends on:", options: ["Speed of rotation", "Mass and its distribution", "Angular velocity", "Torque only"], answer: 1 },
      { q: "Torque is defined as:", options: ["Force × mass", "Force × distance from pivot", "Mass × acceleration", "Momentum / time"], answer: 1 },
      { q: "Angular momentum is conserved when:", options: ["Force is constant", "Net external torque is zero", "Velocity is constant", "Mass is constant"], answer: 1 },
      { q: "The SI unit of torque is:", options: ["Joule", "Newton", "Newton-meter", "Watt"], answer: 2 },
      { q: "A spinning skater pulls her arms in. Her angular speed:", options: ["Decreases", "Increases", "Stays same", "Becomes zero"], answer: 1 },
      { q: "The rotational equivalent of mass is:", options: ["Torque", "Angular velocity", "Moment of inertia", "Angular momentum"], answer: 2 },
      { q: "For a rolling body without slipping, which is true?", options: ["Only KE exists", "Only rotational KE exists", "Both translational and rotational KE exist", "Neither exists"], answer: 2 },
      { q: "Radius of gyration depends on:", options: ["Mass only", "Shape and axis of rotation", "Speed only", "Temperature"], answer: 1 },
      { q: "Angular velocity unit is:", options: ["m/s", "rad/s²", "rad/s", "rev"], answer: 2 },
      { q: "A rigid body is in rotational equilibrium when:", options: ["Net force is zero", "Net torque is zero", "Angular velocity is max", "Moment of inertia is zero"], answer: 1 }
    ]
  },
  chemistry: {
    atomicstructure: [
      { q: "The nucleus of an atom contains:", options: ["Only protons", "Only neutrons", "Protons and neutrons", "Electrons and protons"], answer: 2 },
      { q: "The atomic number of an element equals:", options: ["Number of neutrons", "Number of protons", "Mass number", "Number of electrons in nucleus"], answer: 1 },
      { q: "Who proposed the planetary model of the atom?", options: ["Thomson", "Bohr", "Rutherford", "Dalton"], answer: 2 },
      { q: "The maximum number of electrons in the 3rd shell is:", options: ["8", "18", "32", "2"], answer: 1 },
      { q: "Which has the smallest atomic radius?", options: ["Na", "Mg", "Al", "Si"], answer: 3 },
      { q: "Isotopes have the same:", options: ["Mass number", "Number of neutrons", "Atomic number", "Number of nucleons"], answer: 2 },
      { q: "The energy of an electron in the nth orbit is proportional to:", options: ["n", "n²", "1/n²", "1/n"], answer: 2 },
      { q: "The quantum number that defines the shape of an orbital is:", options: ["Principal (n)", "Azimuthal (l)", "Magnetic (m)", "Spin (s)"], answer: 1 },
      { q: "An orbital can hold a maximum of:", options: ["1 electron", "2 electrons", "4 electrons", "8 electrons"], answer: 1 },
      { q: "Hund's rule states that electrons fill orbitals:", options: ["Paired first", "Singly with parallel spins first", "In random order", "Highest energy first"], answer: 1 }
    ],
    chemicalbonding: [
      { q: "An ionic bond is formed by:", options: ["Sharing of electrons", "Transfer of electrons", "Sharing of protons", "Transfer of neutrons"], answer: 1 },
      { q: "Which molecule has a triple bond?", options: ["O₂", "H₂O", "N₂", "CO₂"], answer: 2 },
      { q: "VSEPR theory predicts molecular:", options: ["Color", "Shape", "Mass", "Reactivity"], answer: 1 },
      { q: "The bond angle in water (H₂O) is approximately:", options: ["180°", "120°", "104.5°", "90°"], answer: 2 },
      { q: "Which bond is the strongest?", options: ["Single bond", "Double bond", "Triple bond", "Ionic bond"], answer: 2 },
      { q: "Electronegativity difference for ionic bond is generally:", options: ["Less than 0.4", "Between 0.4 and 1.7", "Greater than 1.7", "Exactly 1.0"], answer: 2 },
      { q: "Hybridization of carbon in methane (CH₄) is:", options: ["sp", "sp²", "sp³", "sp³d"], answer: 2 },
      { q: "A coordinate bond is formed when:", options: ["Both atoms share electrons equally", "One atom provides both electrons", "Electrons are transferred completely", "No electrons are shared"], answer: 1 },
      { q: "Which property is NOT shown by ionic compounds?", options: ["High melting point", "Electrical conductivity in solution", "Directional bonding", "Crystalline structure"], answer: 2 },
      { q: "The shape of BF₃ molecule is:", options: ["Linear", "Trigonal planar", "Tetrahedral", "Pyramidal"], answer: 1 }
    ],
    thermodynamics: [
      { q: "The first law of thermodynamics is a statement of:", options: ["Conservation of momentum", "Conservation of energy", "Conservation of mass", "Entropy"], answer: 1 },
      { q: "An exothermic reaction:", options: ["Absorbs heat", "Releases heat", "Has no heat change", "Only occurs at high temperature"], answer: 1 },
      { q: "Enthalpy change (ΔH) at constant pressure equals:", options: ["Internal energy change", "Heat exchanged", "Work done", "Entropy change"], answer: 1 },
      { q: "Hess's law is based on:", options: ["Path of reaction", "State function nature of enthalpy", "Rate of reaction", "Temperature dependence"], answer: 1 },
      { q: "For a spontaneous process, Gibbs free energy change (ΔG) is:", options: ["Positive", "Zero", "Negative", "Infinite"], answer: 2 },
      { q: "Entropy is a measure of:", options: ["Heat content", "Disorder or randomness", "Enthalpy", "Free energy"], answer: 1 },
      { q: "The standard enthalpy of formation of an element in standard state is:", options: ["1 kJ/mol", "-1 kJ/mol", "0 kJ/mol", "Undefined"], answer: 2 },
      { q: "An adiabatic process occurs with:", options: ["No temperature change", "No work done", "No heat exchange", "No pressure change"], answer: 2 },
      { q: "Bond dissociation energy is always:", options: ["Negative", "Zero", "Positive", "Equal to lattice energy"], answer: 2 },
      { q: "Which state has highest entropy?", options: ["Solid", "Liquid", "Gas", "Plasma"], answer: 2 }
    ],
    electrochemistry: [
      { q: "Oxidation involves:", options: ["Gain of electrons", "Loss of electrons", "Gain of protons", "Loss of neutrons"], answer: 1 },
      { q: "In a galvanic cell, the anode is:", options: ["Positive electrode", "Negative electrode", "Neutral electrode", "Inert electrode"], answer: 1 },
      { q: "The standard hydrogen electrode has a potential of:", options: ["1 V", "-1 V", "0 V", "0.5 V"], answer: 2 },
      { q: "Faraday's constant is approximately:", options: ["9.6 × 10⁴ C/mol", "6.02 × 10²³ C/mol", "1.6 × 10⁻¹⁹ C/mol", "8.31 J/mol·K"], answer: 0 },
      { q: "Electrolysis of water produces:", options: ["H₂ at cathode, O₂ at anode", "O₂ at cathode, H₂ at anode", "Only H₂", "Only O₂"], answer: 0 },
      { q: "Conductivity of electrolyte solution with dilution:", options: ["Decreases", "Increases", "Stays same", "First increases then decreases"], answer: 1 },
      { q: "The Nernst equation relates EMF to:", options: ["Temperature only", "Concentration of ions", "Pressure only", "Electrode size"], answer: 1 },
      { q: "A salt bridge in a galvanic cell:", options: ["Transfers electrons", "Maintains electrical neutrality", "Increases resistance", "Stores energy"], answer: 1 },
      { q: "Corrosion of iron is essentially a process of:", options: ["Reduction", "Oxidation", "Neutralization", "Precipitation"], answer: 1 },
      { q: "The EMF of a cell is positive when the reaction is:", options: ["Non-spontaneous", "Spontaneous", "At equilibrium", "Endothermic"], answer: 1 }
    ]
  },
  maths: {
    quadraticequations: [
      { q: "For ax² + bx + c = 0, the discriminant is:", options: ["b² + 4ac", "b² - 4ac", "-b² + 4ac", "b - 4ac"], answer: 1 },
      { q: "If discriminant > 0, the roots are:", options: ["Complex", "Equal", "Real and distinct", "Imaginary"], answer: 2 },
      { q: "Sum of roots of ax² + bx + c = 0 is:", options: ["c/a", "-b/a", "b/a", "-c/a"], answer: 1 },
      { q: "Product of roots of ax² + bx + c = 0 is:", options: ["b/a", "-b/a", "c/a", "-c/a"], answer: 2 },
      { q: "The roots of x² - 5x + 6 = 0 are:", options: ["2 and 4", "3 and 2", "1 and 6", "-2 and -3"], answer: 1 },
      { q: "A quadratic equation has exactly:", options: ["1 root", "2 roots", "3 roots", "Infinite roots"], answer: 1 },
      { q: "If roots are equal, discriminant equals:", options: ["1", "-1", "0", "∞"], answer: 2 },
      { q: "The quadratic formula gives x =", options: ["(-b ± √(b²-4ac)) / a", "(-b ± √(b²-4ac)) / 2a", "(b ± √(b²-4ac)) / 2a", "(-b ± √(b²+4ac)) / 2a"], answer: 1 },
      { q: "For roots to be real, which condition must hold?", options: ["b² - 4ac < 0", "b² - 4ac = -1", "b² - 4ac ≥ 0", "b² - 4ac > 1"], answer: 2 },
      { q: "The equation x² + 1 = 0 has:", options: ["Two real roots", "One real root", "No real roots", "Infinite roots"], answer: 2 }
    ],
    sequences: [
      { q: "The nth term of an AP is:", options: ["a + (n+1)d", "a + (n-1)d", "a × (n-1)d", "a - (n-1)d"], answer: 1 },
      { q: "The sum of first n terms of an AP is:", options: ["n/2 (a + l)", "n (a + l)", "n/2 (2a + (n-1)d)", "Both A and C"], answer: 3 },
      { q: "In a GP, the ratio of consecutive terms is called:", options: ["Common difference", "Common ratio", "Common factor", "Common sum"], answer: 1 },
      { q: "The nth term of a GP with first term a and ratio r is:", options: ["a + (n-1)r", "a × rⁿ", "a × r^(n-1)", "a/r^(n-1)"], answer: 2 },
      { q: "Sum of infinite GP (|r| < 1) is:", options: ["a/(1-r)", "a/(1+r)", "ar/(1-r)", "a(1-r)"], answer: 0 },
      { q: "The arithmetic mean of a and b is:", options: ["ab", "(a+b)/2", "√(ab)", "2ab/(a+b)"], answer: 1 },
      { q: "Which is an AP:", options: ["2,4,8,16", "1,1,2,3,5", "3,7,11,15", "1,4,9,16"], answer: 2 },
      { q: "If a, b, c are in GP then b² equals:", options: ["a+c", "ac", "a/c", "a-c"], answer: 1 },
      { q: "The common difference in AP 5,8,11,14 is:", options: ["5", "2", "3", "4"], answer: 2 },
      { q: "Sum of first n natural numbers is:", options: ["n(n+1)", "n(n+1)/2", "n²", "n(n-1)/2"], answer: 1 }
    ],
    limits: [
      { q: "lim(x→0) sin(x)/x equals:", options: ["0", "∞", "1", "Undefined"], answer: 2 },
      { q: "A function is continuous at x=a if:", options: ["f(a) exists", "lim f(x) as x→a exists", "lim f(x) as x→a = f(a)", "f(a) = 0"], answer: 2 },
      { q: "The derivative of xⁿ is:", options: ["xⁿ⁻¹", "nxⁿ", "nxⁿ⁻¹", "nxⁿ⁺¹"], answer: 2 },
      { q: "lim(x→0) (1 + x)^(1/x) equals:", options: ["1", "0", "e", "∞"], answer: 2 },
      { q: "The derivative of sin(x) is:", options: ["-cos(x)", "cos(x)", "-sin(x)", "tan(x)"], answer: 1 },
      { q: "If f(x) = x², then f'(x) equals:", options: ["x", "2x", "x²", "2"], answer: 1 },
      { q: "A function has a local maximum where:", options: ["f'(x) = 0 and f''(x) > 0", "f'(x) = 0 and f''(x) < 0", "f'(x) > 0", "f''(x) = 0"], answer: 1 },
      { q: "The derivative of e^x is:", options: ["xe^(x-1)", "e^x", "e^(x-1)", "x·e^x"], answer: 1 },
      { q: "lim(x→∞) 1/x equals:", options: ["1", "∞", "0", "-1"], answer: 2 },
      { q: "The chain rule is used when differentiating:", options: ["Sum of functions", "Product of functions", "Composite functions", "Constant functions"], answer: 2 }
    ],
    matrices: [
      { q: "A matrix with equal number of rows and columns is called:", options: ["Row matrix", "Column matrix", "Square matrix", "Null matrix"], answer: 2 },
      { q: "The transpose of matrix A is obtained by:", options: ["Multiplying each element by -1", "Swapping rows and columns", "Inverting the matrix", "Adding identity matrix"], answer: 1 },
      { q: "The determinant of a 2×2 matrix [[a,b],[c,d]] is:", options: ["ab - cd", "ad + bc", "ad - bc", "ac - bd"], answer: 2 },
      { q: "A matrix multiplied by its inverse gives:", options: ["Zero matrix", "The matrix itself", "Identity matrix", "Transpose"], answer: 2 },
      { q: "If det(A) = 0, the matrix is:", options: ["Identity", "Invertible", "Singular", "Diagonal"], answer: 2 },
      { q: "For matrix multiplication AB, it is required that:", options: ["A and B are square", "Columns of A = rows of B", "Rows of A = columns of B", "A and B are same size"], answer: 1 },
      { q: "The identity matrix has:", options: ["All zeros", "All ones", "1s on diagonal, 0s elsewhere", "0s on diagonal, 1s elsewhere"], answer: 2 },
      { q: "Cramer's rule is used to solve:", options: ["Quadratic equations", "System of linear equations", "Differential equations", "Trigonometric equations"], answer: 1 },
      { q: "A symmetric matrix satisfies:", options: ["A = -Aᵀ", "A = Aᵀ", "A = A⁻¹", "A = 0"], answer: 1 },
      { q: "The rank of a matrix is:", options: ["Number of rows", "Number of columns", "Max number of linearly independent rows", "Determinant value"], answer: 2 }
    ]
  }
};

// ─── Chapter key map ─────────────────────────────────────
const chapterKeys = {
  physics: {
    'Kinematics': 'kinematics',
    "Newton's Laws": 'nlm',
    'Work Power Energy': 'wpe',
    'Rotational Motion': 'rotational'
  },
  chemistry: {
    'Atomic Structure': 'atomicstructure',
    'Chemical Bonding': 'chemicalbonding',
    'Thermodynamics': 'thermodynamics',
    'Electrochemistry': 'electrochemistry'
  },
  maths: {
    'Quadratic Equations': 'quadraticequations',
    'Sequences & Series': 'sequences',
    'Limits & Derivatives': 'limits',
    'Matrices': 'matrices'
  }
};

// ─── Mock/PDF Data ───────────────────────────────────────
const data = {
  mains: {
    tests: ['Mock Test 1', 'Mock Test 2', 'Mock Test 3'],
    pdfs: [
      { name: 'JEE Mains PYQ 2024', url: '#' },
      { name: 'JEE Mains PYQ 2023', url: '#' },
      { name: 'JEE Mains PYQ 2022', url: '#' }
    ]
  },
  advanced: {
    tests: ['Mock Test 1', 'Mock Test 2'],
    pdfs: [
      { name: 'JEE Advanced PYQ 2024', url: '#' },
      { name: 'JEE Advanced PYQ 2023', url: '#' },
      { name: 'JEE Advanced PYQ 2022', url: '#' }
    ]
  }
};

// ─── State ───────────────────────────────────────────────
let state = {
  screen: 'main',
  type: null,
  subject: null,
  chapter: null,
  currentQ: 0,
  score: 0,
  timer: null,
  timeLeft: 120,
  answered: false,
  lockNext: false,
  resultSaved: false,
  resultSaveMessage: ''
};

// ─── Render ──────────────────────────────────────────────
function render() {
  const container = document.getElementById('test-container');
  if (state.screen === 'main')     container.innerHTML = screenMain();
  if (state.screen === 'subject')  container.innerHTML = screenSubject();
  if (state.screen === 'chapters') container.innerHTML = screenChapters();
  if (state.screen === 'mode')     container.innerHTML = screenMode();
  if (state.screen === 'tests')    container.innerHTML = screenTests();
  if (state.screen === 'pdfs')     container.innerHTML = screenPDFs();
  if (state.screen === 'test')     container.innerHTML = screenTest();
  if (state.screen === 'result')   container.innerHTML = screenResult();
}

// ─── Screens ─────────────────────────────────────────────

function screenMain() {
  return `
    <button class="back-btn" onclick="window.location.href='home.html'">← Back to Home</button>
    <h1>Tests</h1>
    <p>Choose how you want to practice</p>
    <div class="subjects">
      <div class="card" onclick="go('chapterwise')">
        <div>📖</div>
        <div>Chapter-wise</div>
        <div class="card-sub">Practice by topic</div>
      </div>
      <div class="card" onclick="go('mains')">
        <div>📝</div>
        <div>JEE Mains Mock</div>
        <div class="card-sub">Full mocks & PYQs</div>
      </div>
      <div class="card" onclick="go('advanced')">
        <div>🎯</div>
        <div>JEE Advanced Mock</div>
        <div class="card-sub">Full mocks & PYQs</div>
      </div>
    </div>
  `;
}

function screenSubject() {
  return `
    <button class="back-btn" onclick="back()">← Back</button>
    <h1>Chapter-wise</h1>
    <p>Select a subject</p>
    <div class="subjects">
      <div class="card" onclick="goSubject('physics')">
        <div>⚡</div>
        <div>Physics</div>
        <div class="card-sub">4 chapters</div>
      </div>
      <div class="card" onclick="goSubject('chemistry')">
        <div>🧪</div>
        <div>Chemistry</div>
        <div class="card-sub">4 chapters</div>
      </div>
      <div class="card" onclick="goSubject('maths')">
        <div>📐</div>
        <div>Mathematics</div>
        <div class="card-sub">4 chapters</div>
      </div>
    </div>
  `;
}

function screenChapters() {
  const chapters = Object.keys(chapterKeys[state.subject]);
  const label = state.subject.charAt(0).toUpperCase() + state.subject.slice(1);

  const cards = chapters.map(ch => `
    <div class="card" onclick="startTest('${state.subject}', '${ch}')">
      <div>${ch}</div>
      <div class="card-sub">10 Qs · 20 mins</div>
    </div>
  `).join('');

  return `
    <button class="back-btn" onclick="back()">← Back</button>
    <h1>${label}</h1>
    <p>Select a chapter</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenMode() {
  const label = state.type === 'mains' ? 'JEE Mains' : 'JEE Advanced';
  return `
    <button class="back-btn" onclick="back()">← Back</button>
    <h1>${label}</h1>
    <p>What do you want to access?</p>
    <div class="subjects">
      <div class="card" onclick="goMode('tests')">
        <div>⏱️</div>
        <div>Mock Tests</div>
        <div class="card-sub">Timed full-length tests</div>
      </div>
      <div class="card" onclick="goMode('pdfs')">
        <div>📄</div>
        <div>PYQ PDFs</div>
        <div class="card-sub">Download past papers</div>
      </div>
    </div>
  `;
}

function screenTests() {
  const tests = data[state.type].tests;
  const cards = tests.map(t => `
    <div class="card" onclick="alert('${t} coming soon!')">
      <div>⏱️</div>
      <div>${t}</div>
      <div class="card-sub">3 hrs · 300 marks</div>
    </div>
  `).join('');

  return `
    <button class="back-btn" onclick="back()">← Back</button>
    <h1>Mock Tests</h1>
    <p>Select a test to begin</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenPDFs() {
  const pdfs = data[state.type].pdfs;
  const cards = pdfs.map(p => `
    <a href="${p.url}" class="card pdf-card" download>
      <div>📄</div>
      <div>${p.name}</div>
      <div class="card-sub">Click to download</div>
    </a>
  `).join('');

  return `
    <button class="back-btn" onclick="back()">← Back</button>
    <h1>PYQ Papers</h1>
    <p>Download and practice</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenTest() {
  const key = chapterKeys[state.subject][state.chapter];
  const questions = questionBank[state.subject][key];
  const q = questions[state.currentQ];
  const qNum = state.currentQ + 1;
  const total = questions.length;
  const mins = Math.floor(state.timeLeft / 60);
  const secs = String(state.timeLeft % 60).padStart(2, '0');
  const timerClass = state.timeLeft <= 30 ? 'timer danger' : 'timer';

  const options = q.options.map((opt, i) => `
    <button class="option-btn" id="opt-${i}" onclick="selectAnswer(${i})">
      <span class="option-label">${String.fromCharCode(65 + i)}</span>
      ${opt}
    </button>
  `).join('');

  return `
    <div class="test-topbar">
      <div>
        <div class="test-chapter-name">${state.chapter}</div>
        <div class="test-progress">Question ${qNum} of ${total}</div>
      </div>
      <div class="${timerClass}" id="timer-display">${mins}:${secs}</div>
    </div>
    <button class="back-btn" onclick="exitTest()">Exit Test</button>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width: ${(qNum / total) * 100}%"></div>
    </div>
    <div class="question-box">
      <p class="question-text">Q${qNum}. ${q.q}</p>
      <div class="options-list">${options}</div>
    </div>
    <button class="next-btn" id="next-btn" onclick="nextQuestion()" disabled>
      ${state.currentQ === total - 1 ? 'Finish Test →' : 'Next Question →'}
    </button>
  `;
}

function screenResult() {
  const key = chapterKeys[state.subject][state.chapter];
  const total = questionBank[state.subject][key].length; // ✅ was hardcoded as 10
  const score = state.score;
  const percent = Math.round((score / total) * 100);
  const saveMessage = state.resultSaveMessage
    ? `<div class="card-sub">${state.resultSaveMessage}</div>`
    : '';

  let message, messageClass;
  if (percent >= 80)      { message = "Excellent! 🔥"; messageClass = "result-great"; }
  else if (percent >= 50) { message = "Good effort! 👍"; messageClass = "result-ok"; }
  else                    { message = "Keep practicing! 💪"; messageClass = "result-low"; }

  return `
    <div class="result-box">
      <div class="result-title">Test Complete</div>
      <div class="result-chapter">${state.chapter}</div>
      <div class="result-score">${score} / ${total}</div>
      <div class="result-percent">${percent}%</div>
      <div class="result-message ${messageClass}">${message}</div>
      ${saveMessage}
      <div class="result-actions">
        <button class="card" onclick="retryTest()">🔁 Retry</button>
        <button class="card" onclick="back(); back();">📚 All Chapters</button>
        <button class="card" onclick="goHome()">🏠 Home</button>
      </div>
    </div>
  `;
}

// ─── Test Logic ──────────────────────────────────────────

function startTest(subject, chapter) {
  clearInterval(state.timer);
  state.subject = subject;
  state.chapter = chapter;
  state.screen = 'test';
  state.currentQ = 0;
  state.score = 0;
  state.timeLeft = 120;
  state.answered = false;
  state.lockNext = false;
  state.resultSaved = false;
  state.resultSaveMessage = '';
  render();
  startTimer();
}

async function saveTestResult() {
  if (state.resultSaved) return;

  const key = chapterKeys[state.subject][state.chapter];
  const total = questionBank[state.subject][key].length;
  const token = getToken();

  if (!token) {
    handleUnauthorized();
    return;
  }

  state.resultSaveMessage = 'Saving result...';
  render();

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subject: state.subject,
        chapter: chapterKeys[state.subject][state.chapter],
        score: state.score,
        totalQuestions: total,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      state.resultSaveMessage = data.message || 'Result could not be saved.';
      render();
      return;
    }

    state.resultSaved = true;
    state.resultSaveMessage = 'Result saved.';
    render();
  } catch (error) {
    state.resultSaveMessage = 'Result could not be saved. Please check that the backend is running.';
    render();
  }
}

function startTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;

    const display = document.getElementById('timer-display');
    if (display) {
      const mins = Math.floor(state.timeLeft / 60);
      const secs = String(state.timeLeft % 60).padStart(2, '0');
      display.textContent = `${mins}:${secs}`;
      if (state.timeLeft <= 30) display.classList.add('danger');
    }

    if (state.timeLeft <= 0) {
      state.answered = true;
      nextQuestion();
    }
  }, 1000);
}

function selectAnswer(index) {
  if (state.answered) return;
  state.answered = true;

  const key = chapterKeys[state.subject][state.chapter];
  const correct = questionBank[state.subject][key][state.currentQ].answer;

  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === index) btn.classList.add('wrong');
  });

  if (index === correct) state.score++;
  document.getElementById('next-btn').disabled = false;
}

function nextQuestion() {
  if (state.screen !== 'test') return;
  if (state.lockNext) return;
  state.lockNext = true;
  clearInterval(state.timer);

  const key = chapterKeys[state.subject][state.chapter];
  const total = questionBank[state.subject][key].length;

  if (state.currentQ < total - 1) {
    state.currentQ++;
    state.timeLeft = 120;
    state.answered = false;
    render();
    startTimer();
    state.lockNext = false;
  } else {
    state.screen = 'result';
    render();
    saveTestResult();
  }
}

function retryTest() {
  startTest(state.subject, state.chapter);
}

function goHome() {
  state.screen = 'main';
  render();
}

function exitTest() {
  const shouldExit = confirm('Exit this test? Your unfinished attempt will not be saved.');

  if (!shouldExit) return;

  clearInterval(state.timer);
  state.screen = 'main';
  state.currentQ = 0;
  state.score = 0;
  state.timeLeft = 120;
  state.answered = false;
  state.lockNext = false;
  state.resultSaved = false;
  state.resultSaveMessage = '';
  render();
}

// ─── Navigation ──────────────────────────────────────────

function go(type) {
  state.type = type;
  state.screen = type === 'chapterwise' ? 'subject' : 'mode';
  render();
}

function goSubject(subject) {
  state.subject = subject;
  state.screen = 'chapters';
  render();
}

function goMode(mode) {
  state.mode = mode;
  state.screen = mode;
  render();
}

function back() {
  clearInterval(state.timer);
  if (state.screen === 'subject')       state.screen = 'main';
  else if (state.screen === 'chapters') state.screen = 'subject';
  else if (state.screen === 'mode')     state.screen = 'main';
  else if (state.screen === 'tests')    state.screen = 'mode';
  else if (state.screen === 'pdfs')     state.screen = 'mode';
  else if (state.screen === 'result')   state.screen = 'chapters';
  render();
}

// ─── Start ───────────────────────────────────────────────
render();
