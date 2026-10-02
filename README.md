# NexPrep LMS

[![NexPrep Backend CI](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml/badge.svg)](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml)
![Node Version](https://img.shields.io/badge/node-20.x%20%7C%2022.x-brightgreen)
![Tests](https://img.shields.io/badge/tests-301%20passing-success)
![Suites](https://img.shields.io/badge/suites-31%20passed-blue)
![License](https://img.shields.io/badge/license-ISC-blue)

NexPrep is a full-stack Learning Management System (LMS) designed for students preparing for the Joint Entrance Examination (JEE). The platform provides structured chapter-wise concept modules across Physics, Chemistry, and Mathematics, server-authoritative practice quizzes with streak tracking, and JEE Main-style timed mock tests.

To preserve testing integrity without compromising candidate privacy, NexPrep pairs server-authoritative exam sessions with a client-side proctoring pipeline: on-device computer vision and screen structural monitoring generate observable telemetry that is correlated into bounded temporal episodes. An authoritative assessment engine and evaluation gate ensure that academic marks are released only when an attempt reaches `EVALUATED` (indicating no configured deterministic review condition was detected). Attempts requiring technical review (`REVIEW_REQUIRED`) or with insufficient monitoring data (`INSUFFICIENT_DATA`) are held (`HELD_FOR_REVIEW`) with candidate answers preserved for review.

---

## Live Deployments

| Component | Platform | URL / Details |
| :--- | :--- | :--- |
| **Frontend Application** | Netlify | [Live Production App](https://precious-griffin-831939.netlify.app/) |
| **Backend REST API** | Render | [API Gateway](https://nexprep-backend.onrender.com) |
| **Database** | MongoDB Atlas | Cloud MongoDB hosting core collections and telemetry stores |
| **OAuth Identity Provider** | Firebase Auth | Google Sign-In with server-side ID token verification |

---

## Key Features

### Learning & Practice Assessment
* **Curriculum Taxonomy**: Structured curriculum covering 12 core chapters across Physics, Chemistry, and Mathematics, derived from a canonical backend source of truth.
* **Chapter Practice Quizzes**: 10-question practice quizzes evaluated against a 120-question curated bank. Correct answer keys remain strictly on the server; clients receive sanitized question payloads.
* **Practice Streak Telemetry**: Authoritative UTC-evaluated daily practice streaks that deduplicate same-day sessions and preserve momentum across consecutive practice days.
* **Progress Resumption**: Chapter completion tracking supporting idempotent atomic upserts while enforcing one progress record per user/subject/chapter via a compound unique index.
* **Performance Analytics**: Rule-based analytics computing subject-level proficiencies, overall averages, 7-day activity tracking, and targeted subject recommendations.

### JEE Main Mock Testing & Proctoring
* **Timed Mock Exam Sessions**: Multi-section exam navigation across Physics, Chemistry, and Mathematics (configured as a representative 60-minute, 30-question, 120-mark practice test with standard +4 / -1 / 0 marking).
* **Server-Authoritative Countdown Timing**: Exam start, duration, and expiration timestamps are managed by the server. Expired sessions reject new answers while preserving saved progress.
* **Client-Side Telemetry & Local Computer Vision**: Captures browser window focus loss, document visibility changes, and fullscreen state transitions. Runs on-device face and head-pose tracking via MediaPipe FaceLandmarker without streaming raw webcam video to any server.
* **Local Screen Structural Monitoring**: Captures display surfaces via `getDisplayMedia()`, downscales frames to a local 64×48 canvas, extracts an 8-dimensional structural signature, and evaluates similarity against an exam baseline without capturing or uploading raw screenshots.
* **Temporal Event Correlation**: Groups multi-stream telemetry into bounded temporal episodes within a configurable 3000ms window, identifying explicit pairwise observable relationships and linking server-authoritative answer interaction timestamps.
* **Deterministic Assessment & Evaluation Gate**: Evaluates correlated episodes against deterministic rules to classify the attempt (`CLEAR`, `REVIEW_REQUIRED`, or `INSUFFICIENT_DATA`). Academic scoring is authorized and marks are released only when `CLEAR` (reaching `EVALUATED`). Attempts flagged for review transition to `HELD_FOR_REVIEW`, withholding score calculation while keeping candidate answers intact.
* **Evidence Traceability & Access Boundaries**: Generates a traceable evidence structure linking report statements to temporal episodes and raw event records. Proctoring Evidence Reports are access-controlled for held attempts.

### Authentication & Security
* **Authentication**: Supports local email/password authentication (salted and hashed with `bcryptjs`, 12 rounds) and Google OAuth verified server-side with Firebase Admin SDK.
* **Stateless Authorization**: Protected API routes require a signed JSON Web Token (JWT) transmitted via Bearer Authorization headers.
* **Rate Limiting & Protection**: Express rate limiting on authentication routes (20 req / 15 min), Helmet HTTP security headers, CORS origin restrictions, and strict payload size limits.

---

## System Architecture

```text
Student Browser
      │
      │ HTTPS / REST + Telemetry
      ▼
Frontend (Netlify)
  • HTML / CSS / Vanilla JavaScript
  • Client authentication state
  • Timed mock-test UI & answer submission
  • Local webcam & screen telemetry
      │
      ▼
Node.js / Express API (Render)
  • Authentication & authorization (JWT, bcrypt, Google OAuth)
  • Server-authoritative exam timing & single-flight finalization
  • Chapter quiz & mock-test scoring (+4 / -1 / 0)
  • Telemetry ingestion & temporal correlation
  • Deterministic assessment (Rules R1–R7) & evaluation gate
      │
      ▼
MongoDB Atlas
  • Users, progress, and chapter test results
  • Timed mock-test sessions
  • Proctoring telemetry, episodes, and assessment records
```

### Mock Test & Proctoring Lifecycle

```text
MOCK TEST CATALOG
       ↓
READINESS & PERMISSIONS (Camera, Screen Share, Fullscreen)
       ↓
TIMED EXAM SESSION (Authoritative Countdown & Real-Time Local Telemetry)
       ↓
SUBMISSION / TIMEOUT (Single-Flight Protection & Centralized Finalization)
       ↓
TEMPORAL CORRELATION (Bounded Episodes & Multi-Stream Pairwise Clustering)
       ↓
DETERMINISTIC PROCTORING ASSESSMENT (CLEAR / REVIEW_REQUIRED / INSUFFICIENT_DATA)
       ↓
SERVER-AUTHORITATIVE EVALUATION GATE
       ├── [CLEAR] ───────────────→ EVALUATED: Server Computes +4/-1/0 Score → Results Released
       │                                                                      ↓
       │                                                      (Optional Proctoring Evidence Report)
       │
       └── [REVIEW_REQUIRED / ────→ HELD_FOR_REVIEW: Scoring Withheld → Neutral Technical Hold Notice
            INSUFFICIENT_DATA]                       (Candidate Answers Preserved, Report Access Gated)
```

---

## Tech Stack

| Layer | Technologies | Role / Justification |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, ES6 JavaScript | Frameworkless static multi-page architecture deployed on CDN; minimal client-side build requirements. |
| **Backend** | Node.js (20.x/22.x), Express 4 | REST API gateway handling session management, scoring, and telemetry orchestration. |
| **Database** | MongoDB Atlas, Mongoose 9 | Document store with compound unique indexes for progress, date indexes for test history, and session links. |
| **Authentication** | JWT (`jsonwebtoken`), `bcryptjs`, Firebase Admin | Local password authentication and server-side Google OAuth verification. |
| **Client Vision & Media** | `@mediapipe/tasks-vision`, `getUserMedia`, `getDisplayMedia` | On-device browser computer vision and display surface monitoring with pure local analysis. |
| **Testing** | Node.js Test Runner (`node:test`, `node:assert/strict`) | Uses Node.js's built-in `node:test` and `node:assert/strict` APIs rather than an external test framework. |
| **CI / Hosting** | GitHub Actions, Netlify, Render | Automated building and testing on every PR; decoupled static frontend and Node API deployments. |

---

## Core Engineering Design

### 1. Server-Authoritative Evaluation & Tamper Resistance
All answer validation and scoring occur exclusively on the backend:
* **Question Sanitization**: The questions API strips all correct answer keys before payload transmission.
* **Isolated Score Computation**: Scores (+4 / -1 / 0) are derived by server services comparing submitted question IDs and selected option indices against server-stored questions.
* **Client Scores Not Trusted**: Client requests attempting to supply scores, percentages, or evaluation statuses are ignored; evaluation states are strictly assigned by server controllers.

### 2. Deterministic Proctoring Assessment
The proctoring subsystem evaluates observable technical facts rather than attempting subjective inferences:
* **No Probabilistic Cheating Classification**: The system does not output opaque cheating risk scores, calculate probabilities, or infer candidate intent; it evaluates observable telemetry against deterministic rules.
* **Observable Rules**: It checks for explicit conditions—such as repeated browser attention shifts, sustained face absence, multiple faces, head pose deviations, or screen view changes—and correlates them temporally ($\le 3000$ms window).
* **Tri-State Technical Outcomes**:
  - `CLEAR`: No configured deterministic review condition was detected.
  - `REVIEW_REQUIRED`: Configured deterministic review conditions were met based on observed telemetry and correlated evidence.
  - `INSUFFICIENT_DATA`: Insufficient monitoring data to make the configured assessment, such as a missing proctoring session, unavailable monitoring stream, or insufficient stream coverage.

### 3. Server-Authoritative Evaluation Gate
The evaluation gate connects proctoring assessment directly to academic result release:
* **Centralized Finalization**: Both candidate submissions and session timer expirations pass through the centralized finalization path in `mockTestController.js`.
* **Score Release**: When an assessment is `CLEAR`, the session transitions to `EVALUATED`, academic scoring is authorized, and marks are computed.
* **Review Holds**: If an assessment indicates `REVIEW_REQUIRED` or `INSUFFICIENT_DATA`, the session transitions to `HELD_FOR_REVIEW`. Academic scoring and result release are withheld pending review, candidate answers remain preserved, and the candidate receives a neutral technical hold notice.
* **Report Access Boundaries**: Proctoring Evidence Reports are restricted (HTTP 403 Forbidden) for held attempts, preventing candidates with held attempts from accessing internal proctoring evidence.

### 4. Privacy-Conscious On-Device Telemetry
Candidate privacy is protected by performing media analysis directly in the browser:
* **Local In-Memory Processing**: Webcam and screen observations are processed locally in browser memory and are not uploaded or persisted as raw media.
* **Webcam Computer Vision**: The MediaPipe FaceLandmarker model executes client-side via WebAssembly.
* **Screen Monitoring**: Screen capture is downscaled to an in-memory 64×48 canvas. Only an 8-dimensional structural signature (coarse regional luminance averages and RGB color balances) is compared against baseline.
* **Telemetry-Only Transmission**: No webcam video, screen recordings, canvas snapshots, or image blobs are transmitted over the network or saved to database storage.

### 5. Canonical Curriculum Taxonomy
* **Single Source of Truth**: The curriculum taxonomy in `backend/data/taxonomy.js` defines all valid subjects and chapters.
* **Build-Time Compilation**: A build script (`scripts/buildTaxonomy.js`) derives the client-side JavaScript contract (`frontend/scripts/chapterNames.js`).
* **Runtime Validation**: Backend schemas and controllers reject any unrecognized or mismatched subject/chapter combinations.

### 6. Persistence & Indexing
* **Progress Constraints**: A compound unique index on `Progress` (`{ user: 1, subject: 1, chapter: 1 }`) supports idempotent atomic upserts while enforcing one progress record per user/subject/chapter.
* **Query Optimization**: Compound indexing on `TestResult` (`{ user: 1, createdAt: -1 }`) and `MockTestSession` (`{ user: 1, mockTest: 1, status: 1 }`, `{ user: 1, createdAt: -1 }`) supports efficient paginated history lookups and active session queries.
* **Session & Assessment Uniqueness**: Unique indexes on `ProctoringSession` (`{ mockTestSession: 1 }`) and `ProctoringAssessment` (`{ mockTestSession: 1 }`) enforce strict 1:1 relationships with the parent exam session.
* **Heartbeat In-Place Updates**: 30-second candidate heartbeats update an existing session timestamp (`lastHeartbeatAt`) in place without appending rows to the database event log.

---

## REST API Overview

The backend exposes 30 REST endpoints organized across six functional domains:

| Domain | Representative Endpoints | Description & Key Responsibilities |
| :--- | :--- | :--- |
| **Health** | `GET /api/health` | Service liveness probe and database connection status check. |
| **Authentication** | `POST /api/auth/register`<br>`POST /api/auth/login`<br>`POST /api/auth/google`<br>`GET /api/auth/me` | User registration, local bcrypt password login, Firebase Google OAuth ID token verification (all rate-limited), and authenticated profile retrieval. |
| **Progress & Curriculum** | `POST /api/progress/update`<br>`POST /api/progress/complete`<br>`GET /api/progress/stats`<br>`GET /api/progress/continue` | Chapter reading telemetry, completion toggle, subject-wise progress aggregation, and continue-learning resumption lookup. |
| **Chapter Practice Tests** | `GET /api/tests/questions`<br>`POST /api/tests/result`<br>`GET /api/tests/history`<br>`GET /api/tests/dashboard` | Sanitized practice questions (answers excluded), server-authoritative grading, paginated attempt history, and analytics dashboard with active streak. |
| **JEE Mock Tests** | `GET /api/mock-tests`<br>`POST /api/mock-tests/:id/start`<br>`POST /api/mock-tests/:sessionId/answer`<br>`POST /api/mock-tests/:sessionId/submit`<br>`GET /api/mock-tests/:sessionId/result` | Mock exam catalog, session initialization with server timer, answer selection autosave, submission finalization, and result retrieval (`EVALUATED` marks or `HELD_FOR_REVIEW` notice). |
| **Proctoring Telemetry** | `POST /api/mock-tests/:sessionId/proctoring/start`<br>`POST /api/mock-tests/:sessionId/proctoring/event`<br>`POST /api/mock-tests/:sessionId/proctoring/heartbeat`<br>`GET /api/mock-tests/:sessionId/proctoring/report` | Proctoring session lifecycle, immutable event ingestion, 30s session keep-alive synchronization, and Proctoring Evidence Report (access-restricted for held attempts). |

---

## Data Model

```text
User (Persisted root entity)
 ├── Progress (Persisted; compound unique index on { user, subject, chapter })
 ├── TestResult (Persisted; compound index on { user, createdAt: -1 })
 └── MockTestSession (Persisted; compound indexes on { user, mockTest, status } and { user, createdAt: -1 })
      ├── Answers (Embedded subdocument array [{ questionId, section, selectedOption, isMarkedForReview, answeredAt }])
      ├── ProctoringSession (Persisted 1:1 ref; unique index on { mockTestSession })
      │    ├── ProctoringEvent (Persisted append-only stream; compound index on { proctoringSession, timestamp })
      │    └── ProctoringEpisode (Persisted derived clusters; compound index on { proctoringSession, startedAt })
      └── ProctoringAssessment (Persisted 1:1 ref; unique index on { mockTestSession })
           └── TriggeredRules (Embedded subdocument array [{ ruleId, ruleName, category, durationMs, evidenceEventIds, episodeIds }])
```

---

## Testing & Quality Assurance

The backend is verified through an automated test suite implemented using Node.js's built-in `node:test` and `node:assert/strict` APIs rather than an external test framework.

```bash
# Run the complete test suite locally
cd backend
npm test
```

### Verification Summary
* **301 automated tests across 31 test suites in 19 test files**, all passing.
* **Continuous Integration**: GitHub Actions workflow automatically builds the taxonomy contract and runs `npm test` on every push and pull request targeting `main`.
* **Test Scope**: Automated tests cover the major behavioral guarantees across authentication, LMS flows, mock-test lifecycle, proctoring, evaluation gating, authorization, and failure handling.

### Major Areas Verified
* **Authentication & Middleware**: JWT verification, email normalization, password hashing, and error handling.
* **Database Constraints & Query Behavior**: Compound-index verification, pagination clamping, lean queries, and user isolation.
* **Scoring & Question Sanitization**: Complete answer key exclusion in API payloads, negative marking (+4 / -1 / 0), and tampering resistance.
* **State Machine Hysteresis**: Pure DOM-independent observation state machines for webcam face detection and screen structural signature comparison, verifying transient noise suppression and clean teardown.
* **Temporal Correlation**: Bounded clustering ($\le 3000$ms window, 30s max cluster duration), pairwise relationships, deterministic timestamp tie-breaking, and answer interaction linkage.
* **Deterministic Assessment & Evaluation Gate**: Rules R1 through R7, derivation of `CLEAR`, `REVIEW_REQUIRED`, and `INSUFFICIENT_DATA`, score release for sessions reaching `EVALUATED`, and score withholding for held sessions.
* **Invariants & Security Boundaries**: Centralized finalization idempotency, access authorization (HTTP 403 on another user's session), and proctoring evidence report access boundaries.

### Validation Boundaries
Browser-native user permission dialogs (`getUserMedia`, `getDisplayMedia`) and physical camera lighting/hardware performance are real-world client-side boundaries evaluated manually on physical target devices.

---

## Project Structure

```text
NexPrep-LMS/
├── .github/
│   └── workflows/ci.yml       # GitHub Actions CI workflow (Node 20.x, build & test)
├── backend/
│   ├── config/                # MongoDB pooling (db.js) and Firebase Admin SDK setup
│   ├── controllers/           # API request controllers (auth, progress, tests, mock tests, proctoring)
│   ├── data/                  # Question bank (120 questions), taxonomy, and representative mock test data
│   ├── middleware/            # JWT auth, centralized error pipeline, and express-rate-limit
│   ├── models/                # Mongoose schemas (User, Progress, TestResult, MockTest, Sessions, Events, Episodes, Assessment)
│   ├── routes/                # Express route declarations (auth, health, progress, tests, mock tests)
│   ├── scripts/               # buildTaxonomy.js compiling canonical backend taxonomy to frontend
│   ├── services/              # Domain logic (scoring, streaks, temporal correlation, assessment, reports)
│   ├── tests/                 # 19 automated test files verifying backend logic natively with node:test
│   ├── .env.example           # Environment configuration template
│   ├── package.json           # Backend dependencies and scripts
│   └── server.js              # Express app initialization and HTTP server bootstrap
├── frontend/
│   ├── scripts/
│   │   ├── proctoring/        # Client-side webcam CV, screen monitoring, and pure state machines
│   │   ├── auth.js            # Client token management and authenticated fetch wrapper
│   │   ├── mockTest.js        # JEE Mock Test exam interface, evaluation gate & telemetry controller
│   │   └── test.js            # Chapter practice quiz controller
│   ├── styles/                # View-specific and global CSS stylesheets
│   ├── mock-test.html         # JEE Main mock exam interface
│   ├── test.html              # Chapter practice quiz interface
│   └── *.html                 # Student views (home, chapter, dashboard, history, auth)
├── netlify.toml               # Netlify hosting configuration, security headers, and caching policies
└── README.md                  # System architecture and technical documentation
```

---

## Local Setup & Development

### 1. Prerequisites
* **Node.js**: `20.x` or `22.x`
* **MongoDB**: A running local MongoDB instance (`mongodb://127.0.0.1:27017/nexprep`) or a MongoDB Atlas URI

### 2. Backend Configuration & Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory based on `.env.example`:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Configure `backend/.env`:

```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/nexprep
JWT_SECRET=your_development_secret_key_here
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500,https://your-app.netlify.app

# Optional: set to true if your ISP fails MongoDB Atlas SRV resolution
DNS_OVERRIDE=false

# Optional: Firebase Admin credentials for Google OAuth verification
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_key\n-----END PRIVATE KEY-----\n"
```

Compile the frontend taxonomy contract and start the backend:

```bash
# Compile canonical taxonomy into frontend contract
npm run build:taxonomy

# Start development server with hot-reload
npm run dev

# Run automated test suite
npm test
```

### 3. Frontend Setup

Serve the `frontend/` directory using any local static HTTP server:

```bash
cd frontend

# Using Python 3
python -m http.server 3000

# Or using Node.js npx serve
npx serve -l 3000 .
```

Open `http://localhost:3000` in your web browser. The frontend is configured to use the API server running on port 5000.
