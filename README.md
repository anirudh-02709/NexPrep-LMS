# NexPrep LMS

[![NexPrep Backend CI](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml/badge.svg)](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml)
![Node Version](https://img.shields.io/badge/node-20.x%20%7C%2022.x-brightgreen)
![Tests](https://img.shields.io/badge/tests-76%20passing-success)
![Suites](https://img.shields.io/badge/suites-9%20passed-blue)
![License](https://img.shields.io/badge/license-ISC-blue)

NexPrep is a full-stack Learning Management System (LMS) engineered for students preparing for the Joint Entrance Examination (JEE). The platform delivers structured chapter-wise concept modules across Physics, Chemistry, and Mathematics, server-authoritative timed test assessments, persistent chapter progress telemetry with continue-learning resumption, timezone-independent consecutive practice streaks, and rule-based performance analytics.

The application couples a static, lightweight multi-page frontend hosted on Netlify with an Express REST API deployed on Render, backed by MongoDB Atlas for user data and Firebase for Google OAuth identity verification.

---

## Live Deployment

| Component | Platform | URL / Details |
| :--- | :--- | :--- |
| **Frontend Web Application** | Netlify | [Live Production App](https://precious-griffin-831939.netlify.app/) |
| **Backend REST API** | Render | [API Gateway](https://nexprep-backend.onrender.com) |
| **Database** | MongoDB Atlas | Cloud database hosting collections: `users`, `progresses`, `testresults` |
| **OAuth Identity Provider** | Firebase Auth | Google Sign-In with server-side token verification |

---

## Key Features

* **Dual Authentication & Unified Identity**: Supports local credentials (passwords hashed with `bcryptjs`, work factor: 12 rounds) and Google OAuth (Firebase Client SDK). User accounts are linked across authentication providers by normalized email address (`lowercase` and `trim`).
* **Server-Authoritative Test & Scoring Engine**: Correct answer keys are maintained exclusively on the server and are never delivered to the client during test generation (`GET /api/tests/questions`). Submissions are validated and graded server-side against an authoritative 120-question bank, preventing client-side answer-key inspection and client-side score fabrication.
* **JEE Main Mock Test Subsystem**: Alongside existing chapter-wise practice tests, NexPrep includes a separate JEE Main Mock Test subsystem (`/api/mock-tests/*`, `MockTest`, `MockTestSession`, and `mock-test.html`). It features multi-section navigation across Physics, Chemistry, and Mathematics, server-authoritative countdown timing, +4 / -1 / 0 marking scheme, resilient attempt restoration upon browser refresh, and comprehensive post-exam analytics.
* **Granular Progress Telemetry & Resumption**: Chapter access and completion states are stored via atomic upsert operations (`$set`, `$setOnInsert`) on compound-unique indexed records (`{ user: 1, subject: 1, chapter: 1 }`). A dedicated continue-learning endpoint allows students to instantly resume their most recently studied module.
* **Timezone-Independent Consecutive Practice Streaks**: An authoritative streak service calculates active daily practice streaks in UTC calendar days, providing deterministic streak evaluation across clients. The algorithm deduplicates multiple tests taken on the same calendar day, preserves the active streak if the user practiced yesterday but has not yet practiced today, and resets to 0 if both days are missed or if calendar gaps occur.
* **Rule-Based Performance Analytics**: The dashboard computes overall score averages, subject-level performance percentages, detects strongest and weakest subject areas (triggering targeted study recommendations when averages fall below 60%), tracks 7-day consistency activity, and detects score trends across attempts.
* **Compound-Indexed Query Pagination**: Test attempt history is paginated with boundary validation, leveraging a compound index on `{ user: 1, createdAt: -1 }` with lean document projection for minimal memory overhead and fast lookup.
* **Single-Source Canonical Taxonomy**: The canonical curriculum taxonomy in `backend/data/taxonomy.js` acts as the single source of truth. A build-time compiler (`scripts/buildTaxonomy.js`) derives the frontend contract (`frontend/scripts/chapterNames.js`), while backend controllers and Mongoose schemas enforce valid subject and chapter values at runtime.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend Client - Netlify"]
        UI["Static UI Views"]
        ApiClient["auth.js and apiFetch"]
        QuizEngine["Quiz Engine - test.js"]
    end

    subgraph Gateway ["Express REST API - Render"]
        Security["Security and Rate Limiting"]
        AuthMiddleware["JWT Middleware - protect"]
        ErrorPipeline["Centralized Error Pipeline"]
    end

    subgraph Controllers ["Application Controllers and Services"]
        AuthCtrl["authController.js"]
        ProgressCtrl["progressController.js"]
        TestCtrl["testController.js"]
        ScoringSvc["testScoring.js"]
        StreakSvc["streakService.js"]
    end

    subgraph Storage ["Data and External Services"]
        Taxonomy["Taxonomy and Question Bank"]
        MongoDB["MongoDB Atlas Database"]
        FirebaseAdmin["Firebase Admin SDK"]
    end

    UI --> ApiClient
    QuizEngine --> ApiClient
    ApiClient -->|HTTP REST| Security

    Security --> AuthCtrl
    Security --> AuthMiddleware
    AuthMiddleware --> ProgressCtrl
    AuthMiddleware --> TestCtrl

    AuthCtrl --> MongoDB
    AuthCtrl --> FirebaseAdmin
    ProgressCtrl --> MongoDB
    ProgressCtrl --> Taxonomy
    TestCtrl --> MongoDB
    TestCtrl --> ScoringSvc
    TestCtrl --> StreakSvc
    ScoringSvc --> Taxonomy

    Security --> ErrorPipeline
    AuthMiddleware --> ErrorPipeline
```

---

## Authentication & Security

NexPrep implements a defense-in-depth security model designed to ensure credential safety, origin integrity, and request rate control.

### Authentication & Authorization Flow

```mermaid
flowchart TD
    subgraph ClientAuth ["Client Authentication Options"]
        LocalLogin["Student enters email and password"]
        GoogleLogin["Student selects Continue with Google"]
        GoogleToken["Firebase SDK returns Google ID token"]
    end

    subgraph GatewayAuth ["Express API Gateway"]
        RateLimit["authLimiter: Rate limit check - 20 req per 15 min"]
    end

    subgraph Verification ["Authentication and User Verification"]
        VerifyLocal["authController: Normalize email and compare bcrypt hash"]
        VerifyGoogle["authController: Verify token via Firebase Admin SDK"]
        UserRecord["MongoDB: Find or upsert user document"]
        GenerateJWT["Generate signed JWT - 7-day expiration"]
    end

    subgraph ProtectedFlow ["Protected Route Authorization"]
        ClientReq["Client sends request with Bearer JWT header"]
        Protect["authMiddleware.protect: Verify JWT and find user"]
        AllowRoute["Authorized: Route handler executes"]
    end

    LocalLogin --> RateLimit
    GoogleLogin --> GoogleToken
    GoogleToken --> RateLimit

    RateLimit -->|POST /api/auth/login| VerifyLocal
    RateLimit -->|POST /api/auth/google| VerifyGoogle

    VerifyLocal --> UserRecord
    VerifyGoogle --> UserRecord
    UserRecord --> GenerateJWT
    GenerateJWT -->|JWT returned to client| ClientReq

    ClientReq --> Protect
    Protect --> AllowRoute
```

### Security Controls

* **Password Security**: Passwords are salted and hashed using `bcryptjs` with a work factor of 12 rounds. Plaintext passwords are never stored or logged.
* **Rate Limiting**: `express-rate-limit` enforces a strict 20 requests per 15-minute quota on `/api/auth/register`, `/api/auth/login`, and `/api/auth/google` to mitigate brute-force and credential stuffing attacks.
* **HTTP Security Headers**: `helmet` manages standard security headers:
  * `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
  * `X-Frame-Options: SAMEORIGIN` (Clickjacking prevention)
  * `Strict-Transport-Security` (Enforces HTTPS)
  * `Cross-Origin-Resource-Policy: cross-origin` (Permits cross-origin resource loading between Netlify and Render)
* **CORS Origin Whitelisting**:
  * **Backend**: Express validates incoming `Origin` headers against configured environment domains (`ALLOWED_ORIGINS` / `CLIENT_URL`) with fallback to local development hosts.
  * **Frontend**: Netlify configuration (`netlify.toml`) restricts `Access-Control-Allow-Origin` strictly to the production frontend domain (`https://precious-griffin-831939.netlify.app`).
* **Request Sanitization & Payload Limits**: JSON body payloads are restricted to `100kb` via `express.json({ limit: '100kb' })`, which limits oversized request bodies and reduces memory-abuse risk.
* **Centralized Error Handling**: Production error middleware catches synchronous and asynchronous exceptions, returning structured JSON error messages without exposing stack traces, internal paths, or database structures.
* **Conditional DNS Resolver**: For local developer environments where regional ISP DNS servers fail MongoDB Atlas SRV lookups, `DNS_OVERRIDE=true` enables fallback to Google Public DNS (`8.8.8.8`, `8.8.4.4`). This override remains disabled in containerized production environments to preserve native cloud DNS discovery.

---

## Test Engine & Server-Authoritative Scoring

A foundational architecture principle of NexPrep is that **the client is never trusted with test evaluation or score determination**.

```mermaid
flowchart TD
    subgraph TestDelivery ["1. Question Delivery - Sanitized"]
        SelectTopic["Student selects Subject and Chapter"]
        FetchQuestions["GET /api/tests/questions"]
        SanitizeQuestions["testScoring.js: Strip answer keys from 10 questions"]
        ReceiveQuestions["Browser receives sanitized questions and starts 120s timer"]
    end

    subgraph TestSubmission ["2. Server-Authoritative Scoring"]
        SubmitAnswers["Student submits question IDs and chosen options"]
        PostResult["POST /api/tests/result"]
        ValidateSubmission["testScoring.js: Validate 10 questions, taxonomy, and bounds"]
        GradeSubmission["testScoring.js: Grade server-side against authoritative key"]
        SaveResult["MongoDB: Save TestResult record"]
        ReturnScore["Return score and percentage to student"]
    end

    subgraph TestAnalytics ["3. Dashboard and Streak Calculation"]
        LoadDashboard["GET /api/tests/dashboard"]
        QueryHistory["MongoDB: Fetch all user test attempts"]
        StreakCalc["streakService.js: Evaluate consecutive UTC calendar days"]
        RenderInsights["Render analytics, subject averages, and streak count"]
    end

    SelectTopic --> FetchQuestions
    FetchQuestions --> SanitizeQuestions
    SanitizeQuestions --> ReceiveQuestions
    ReceiveQuestions --> SubmitAnswers

    SubmitAnswers --> PostResult
    PostResult --> ValidateSubmission
    ValidateSubmission --> GradeSubmission
    GradeSubmission --> SaveResult
    SaveResult --> ReturnScore

    ReturnScore --> LoadDashboard
    LoadDashboard --> QueryHistory
    QueryHistory --> StreakCalc
    StreakCalc --> RenderInsights
```

### Evaluation Protocol

1. **Question Sanitization**: When questions are retrieved (`GET /api/tests/questions`), `testScoring.js` maps over the question bank and removes the `answer` property entirely. Clients receive only the question ID, question text, and option strings.
2. **Submission Payload**: The student completes the 120-second test. The frontend posts an array of answer objects (`{ questionId, selectedOption }`).
3. **Rigorous Server-Side Validation**:
   - The submission array length must match the expected chapter question count (10).
   - Every `questionId` must belong to the specified subject and chapter in the authoritative question bank.
   - Duplicate question IDs in the submission are rejected with HTTP 400.
   - Selected option indices must be valid integers in the `[0, 3]` range.
4. **Authoritative Grading**: The server grades each submitted question against the in-memory authoritative answer key, deriving the score independently. Any client-provided score or total count parameters in the request body are ignored.
5. **Persistence**: The authoritative result is committed to the `testresults` collection with a reference to the authenticated user.

---

## Progress Tracking

The progress system tracks student activity across the 12-chapter curriculum with idempotent database operations.

```mermaid
flowchart TD
    subgraph UserActions ["Student Browser Actions"]
        OpenChapter["Open chapter module"]
        ToggleStatus["Toggle completion status"]
        OpenDashboard["Visit home or dashboard"]
    end

    subgraph Endpoints ["Express REST Endpoints"]
        UpdateRoute["POST /api/progress/update"]
        CompleteRoute["POST /api/progress/complete"]
        ContinueRoute["GET /api/progress/continue"]
        StatsRoute["GET /api/progress/stats"]
    end

    subgraph BackendStorage ["Validation and Database Operations"]
        CheckTaxonomy["validateSubjectAndChapter: Verify valid taxonomy"]
        UpsertLastOpened["MongoDB: Atomic upsert updating lastOpenedAt"]
        UpsertCompleted["MongoDB: Atomic upsert updating completed flag"]
        QueryContinue["MongoDB: Find most recently opened chapter"]
        QueryStats["MongoDB: Fetch completed chapters for subject totals"]
    end

    subgraph ClientViews ["Client UI Updates"]
        ContinueCard["Render Continue Learning card on home page"]
        ProgressBars["Render subject and overall completion percentages"]
    end

    OpenChapter --> UpdateRoute
    ToggleStatus --> CompleteRoute
    OpenDashboard --> ContinueRoute
    OpenDashboard --> StatsRoute

    UpdateRoute --> CheckTaxonomy
    CompleteRoute --> CheckTaxonomy
    CheckTaxonomy --> UpsertLastOpened
    CheckTaxonomy --> UpsertCompleted

    ContinueRoute --> QueryContinue
    QueryContinue --> ContinueCard

    StatsRoute --> QueryStats
    QueryStats --> ProgressBars
```

### Telemetry Mechanics

* **Atomic Upserts**: Progress updates utilize Mongoose `findOneAndUpdate` with `{ upsert: true }`, `$set`, and `$setOnInsert`. Combined with the compound unique index `{ user: 1, subject: 1, chapter: 1 }`, this ensures idempotent updates and avoids duplicate progress records.
* **Continue Learning Resumption**: When a student opens a chapter, `lastOpenedAt` is stamped with the current timestamp. The `GET /api/progress/continue` endpoint sorts by `lastOpenedAt: -1` to immediately return the latest topic for the home page banner.
* **Curriculum Completion Aggregation**: `GET /api/progress/stats` calculates completed chapters per subject against the canonical taxonomy chapter count, returning exact completion percentages for Physics, Chemistry, Mathematics, and Overall.

---

## Analytics & Rule-Based Performance Insights

The dashboard service (`GET /api/tests/dashboard`) processes student test history using an in-memory analytics engine:

* **Overall Test Metrics**: Aggregates total tests completed and computes cumulative average score percentage.
* **Subject-Wise Distribution**: Tallies the total test attempts across Physics, Chemistry, and Mathematics.
* **Strengths & Weaknesses Identification**: Calculates percentage averages per subject. Identifies the highest-performing subject (`strongestSubject`) and lowest-performing subject (`weakestSubject`). When the weakest subject falls below a 60% average, the engine outputs a targeted study recommendation.
* **7-Day Consistency Monitoring**: Filters test results from the preceding 7 calendar days:
  * ≥ 2 tests: `"You are practicing consistently."`
  * 1 test: `"You've practiced recently, keep it up!"`
  * 0 tests: `"Your activity has decreased recently."`
* **Performance Trajectory Trend**: Compares the average score of the 2 most recent tests against the 2 tests preceding them (requires ≥ 4 tests):
  * Difference > +5%: `"Improving"`
  * Difference < -5%: `"Needs Attention"`
  * Difference within ± 5%: `"Stable"`
* **Authoritative Consecutive Practice Streak (`streakService.js`)**:
  * **Global Scope**: Evaluates all user test timestamps, independent of history pagination limits.
  * **UTC Calendar Extraction**: Converts timestamps to UTC `YYYY-MM-DD` date strings, providing deterministic streak evaluation across clients regardless of local system timezones.
  * **Day Deduplication**: Multiple tests completed on the same calendar day count as a single active practice day.
  * **Active Day Grace Logic**: If the user practiced today (UTC), the streak includes today and consecutive preceding days. If the user has not practiced today yet but practiced yesterday (UTC), the streak remains active from yesterday. Missing both today and yesterday resets the streak to 0.
  * **Gap Detection**: Any missing calendar day breaks the streak.

---

## REST API Reference

The backend provides 16 REST endpoints structured across Health, Authentication, Progress, and Tests.

| Method | Endpoint | Description | Access / Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | API status and root welcome probe | Public |
| `GET` | `/api/health` | Service liveness and health check | Public |
| `POST` | `/api/auth/register` | Register a new local user account | Public (Rate-Limited: 20 req / 15 min) |
| `POST` | `/api/auth/login` | Authenticate local user with email and password | Public (Rate-Limited: 20 req / 15 min) |
| `POST` | `/api/auth/google` | Authenticate with Firebase Google ID token | Public (Rate-Limited: 20 req / 15 min) |
| `GET` | `/api/auth/me` | Retrieve authenticated user profile | Bearer JWT |
| `POST` | `/api/progress/update` | Update last-opened timestamp for a chapter | Bearer JWT |
| `POST` | `/api/progress/complete` | Mark a chapter as completed | Bearer JWT |
| `POST` | `/api/progress/incomplete` | Mark a chapter as incomplete | Bearer JWT |
| `GET` | `/api/progress/status` | Query completion status of a specific chapter | Bearer JWT (`?subject=...&chapter=...`) |
| `GET` | `/api/progress/stats` | Retrieve subject-wise and overall progress percentages | Bearer JWT |
| `GET` | `/api/progress/continue` | Retrieve most recently visited chapter for resumption | Bearer JWT |
| `GET` | `/api/tests/questions` | Retrieve sanitized test questions (answers omitted) | Bearer JWT (`?subject=...&chapter=...`) |
| `POST` | `/api/tests/result` | Submit test answers for authoritative server grading | Bearer JWT |
| `GET` | `/api/tests/history` | Retrieve paginated test attempt history | Bearer JWT (`?page=1&limit=5`) |
| `GET` | `/api/tests/dashboard` | Retrieve performance metrics, insights, and streak | Bearer JWT |

---

## Database Design

Dynamic application data is stored in MongoDB Atlas across three schemas with explicit validation constraints and compound indexing:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MONGODB ATLAS SCHEMAS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. User (Collection: users)                                                 │
│    - name: String (required, trimmed, max 100 chars)                        │
│    - email: String (required, unique, lowercase, trimmed)                   │
│    - password: String (required for local auth, bcrypt hash, min 6 chars)   │
│    - firebaseUid: String (sparse unique index, for Google OAuth users)      │
│    - authProvider: String (enum: ['local', 'google'], default: 'local')     │
│    - createdAt: Date (default: Date.now)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Progress (Collection: progresses)                                        │
│    - user: ObjectId (ref: 'User', required)                                 │
│    - subject: String (enum: TAXONOMY_SUBJECTS, required)                    │
│    - chapter: String (enum: TAXONOMY_CHAPTERS, required)                    │
│    - completed: Boolean (default: false)                                    │
│    - lastOpenedAt: Date (default: Date.now)                                 │
│    * Compound Unique Index: { user: 1, subject: 1, chapter: 1 }             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. TestResult (Collection: testresults)                                     │
│    - user: ObjectId (ref: 'User', required)                                 │
│    - subject: String (enum: TAXONOMY_SUBJECTS, required)                    │
│    - chapter: String (enum: TAXONOMY_CHAPTERS, required)                    │
│    - score: Number (required, integer, min: 0)                              │
│    - totalQuestions: Number (required, integer, min: 1)                     │
│    - createdAt: Date (default: Date.now)                                    │
│    * Compound Index: { user: 1, createdAt: -1 }                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Indexing Rationale

* **`Progress` Unique Compound Index (`{ user: 1, subject: 1, chapter: 1 }`)**: Enforces that each user has at most one progress document per chapter, supporting idempotent upserts without duplicate records.
* **`TestResult` Compound Index (`{ user: 1, createdAt: -1 }`)**: Compound indexes support efficient user-scoped lookups and date-ordered pagination for test history and dashboard queries without requiring in-memory sorting.

---

## Automated Testing & CI

The backend is verified through an automated test suite implemented natively using Node.js's built-in test runner (`node:test`, `node:assert`). It operates with zero external testing dependencies.

* **61 automated tests across 8 test suites, all currently passing**
* **GitHub Actions CI** runs on every push and pull request targeting `main`

```bash
# Run the complete test suite locally
cd backend
npm test
```

### Test Suite Breakdown

```text
▶ Authentication & JWT Protection Suite (8 tests) ...................... ✔ PASS
  - Email normalization (whitespace trimming and lowercasing)
  - Mixed-case registration and login resolution
  - Password mismatch rejection with HTTP 401
  - Missing token rejection with HTTP 401
  - Malformed JWT rejection with HTTP 401
  - Expired JWT rejection with HTTP 401
  - Valid JWT verification and user document attachment
  - Live database deletion check for valid tokens

▶ Production Error Handling & Middleware Suite (5 tests) ............... ✔ PASS
  - notFound middleware structured 404 JSON response
  - CORS policy violation handling with HTTP 403
  - Malformed JSON SyntaxError handling with HTTP 400
  - Custom status code preservation without leaking stack traces
  - Fallback to HTTP 500 when status code is undefined or 200

▶ Query Efficiency, Indexing & Pagination Suite (5 tests) ............... ✔ PASS
  - Schema declaration verification for compound index { user: 1, createdAt: -1 }
  - Test history pagination and boundary clamping (page, limit)
  - Clean handling of empty history records
  - Dashboard analytics computation using lean queries
  - Multi-user isolation enforcing strict req.user.id scoping

▶ Server-Authoritative Test Scoring & Question Sanitization (12 tests) . ✔ PASS
  - Question sanitization ensuring zero answer keys sent to client
  - Perfect score derivation (10/10)
  - Zero score derivation (0/10)
  - Mixed correct and incorrect answer evaluation
  - Invalid question ID rejection with HTTP 400
  - Duplicate question ID rejection with HTTP 400
  - Out-of-bounds option index rejection with HTTP 400
  - Incomplete question submission rejection with HTTP 400
  - Malformed submission structure rejection with HTTP 400
  - Tampering immunity: client-supplied scores/totals are ignored
  - Sanitized questions endpoint contract verification
  - Complete submission grading verification across all 12 chapters

▶ Security, Helmet & Rate Limiting Suite (4 tests) ..................... ✔ PASS
  - authLimiter permits requests within 20 req / 15 min quota
  - authLimiter rejects excess requests with HTTP 429
  - DNS server override strictly conditioned on DNS_OVERRIDE === 'true'
  - Helmet attaches standard security headers (nosniff, SAMEORIGIN, HSTS)

▶ Targeted Streak Calculation Suite (9 tests) .......................... ✔ PASS
  - Returns 0 for empty, null, or undefined results array
  - Safely ignores invalid dates and malformed objects without throwing
  - Returns streak of 1 when a test was completed today (UTC)
  - Deduplicates multiple tests on the same calendar day into one practice day
  - Counts consecutive days correctly across multiple attempts per day
  - Preserves active streak if practiced yesterday but not yet today
  - Breaks streak on calendar date gaps
  - Strictly timezone-independent UTC date evaluation
  - Computes streak across all user tests exceeding pagination limits

▶ Canonical Single-Source Taxonomy Suite (6 tests) ..................... ✔ PASS
  - Canonical taxonomy contains all 3 subjects with exact 4 chapters each
  - Derived taxonomy structures map subjects and chapters accurately
  - Helper functions return correct display titles and parent subjects
  - Question bank contains authoritative entries for 100% of taxonomy chapters
  - validateSubjectAndChapter enforces single-source-of-truth rules
  - buildTaxonomy script generates valid frontend JavaScript contracts

▶ Taxonomy & Input Validation Suite (12 tests) ......................... ✔ PASS
  - Accepts all valid subject and chapter combinations
  - Rejects unknown subjects with HTTP 400
  - Rejects unknown chapters with HTTP 400
  - Rejects mismatched subject/chapter pairings with HTTP 400
  - Strictly rejects XSS payloads in subject/chapter fields with HTTP 400
  - TestResult model rejects negative scores
  - TestResult model rejects scores exceeding totalQuestions
  - TestResult model rejects non-integer scores and totalQuestions
  - TestResult model rejects subjects/chapters outside taxonomy enum
  - Progress model rejects subjects/chapters outside taxonomy enum
  - updateProgress controller rejects unknown subject/chapter with HTTP 400
  - getChapterStatus controller rejects invalid query parameters with HTTP 400
```

---

## Engineering Decisions & Trade-offs

### 1. Server-Authoritative Scoring vs. Client-Side Evaluation
* **Decision**: All question verification, answer checking, and score calculations are performed strictly on the server. Clients receive sanitized questions containing no answer properties.
* **Trade-off**: Increases network round-trip overhead on test submission as answers are sent over HTTP. In exchange, client-side answer-key inspection (e.g., via browser DevTools or Network tabs) and client-side score fabrication are prevented.

### 2. Code-Versioned Canonical Curriculum vs. Database CMS Storage
* **Decision**: The 12 core chapters and 120 curated questions are version-controlled directly in code (`taxonomy.js`, `questionBank.js`) and compiled to frontend contracts via `scripts/buildTaxonomy.js`.
* **Trade-off**: Adding or updating questions requires a Git commit and deployment rather than an administrative CMS interface. In exchange, question lookups execute in-memory with zero database query latency during test sessions, and valid subjects and chapters are enforced across the build-time frontend contract and runtime backend validation.

### 3. Vanilla JavaScript & Multi-Page Architecture vs. Heavy SPA Framework
* **Decision**: The frontend is built using standard HTML5, modern CSS3, and ES6 JavaScript modules with no frontend framework (e.g., React, Vue).
* **Trade-off**: Managing DOM state across separate pages requires explicit event binding and shared script modules. In exchange, the application has zero bundle-compilation overhead, ultra-fast initial page loads, zero runtime framework dependencies, and runs cleanly on static hosting.

### 4. Compound Indexing & Lean Projections vs. Ad-Hoc Queries
* **Decision**: Compound indexes were established on `testresults` (`{ user: 1, createdAt: -1 }`) and `progresses` (`{ user: 1, subject: 1, chapter: 1 }`), with queries leveraging Mongoose `.lean()`.
* **Trade-off**: Introduces minor write overhead during index maintenance on inserts. In exchange, compound indexes support efficient user-scoped lookups and date-ordered pagination without full collection scans, while `.lean()` reduces Node.js memory overhead by returning plain JavaScript objects instead of hydrated Mongoose documents.

### 5. UTC Calendar Day Streak vs. Rolling 24-Hour Window
* **Decision**: Practice streaks evaluate calendar days in UTC (`YYYY-MM-DD`), deduplicating multiple tests per day and preserving an active streak if practiced yesterday.
* **Trade-off**: UTC calendar boundaries do not adjust to local student timezones. However, UTC calendar boundaries provide deterministic streak evaluation across clients, avoid edge cases around daylight saving time shifts, and ensure consistent, predictable streak calculations across distributed environments.

---

## Deployment Configuration

The application is deployed across decoupled hosting platforms:

```text
Student Browser
      │
      ├──> [Netlify CDN] ─── Static HTML, CSS, Scripts (Cache-Control: immutable)
      │
      └──> [Render API] ──── Express Gateway & Controllers
                 │
                 ├──> [MongoDB Atlas] ──── Persistent Records (Users, Progress, Tests)
                 └──> [Firebase Admin] ─── Cryptographic Google ID Token Verification
```

### Frontend (Netlify)
* **Configuration**: `netlify.toml` in repository root.
* **Publish Directory**: `frontend`
* **Security Headers**: Injects `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`.
* **CORS Header**: Restricts `Access-Control-Allow-Origin` to `https://precious-griffin-831939.netlify.app`.
* **Asset Caching**: Static assets under `/styles/*` and `/scripts/*` are configured with `Cache-Control: public, max-age=31536000, immutable`.

### Backend (Render)
* **Runtime**: Node.js 20+ Web Service
* **Build Command**: `npm ci && npm run build:taxonomy`
* **Start Command**: `node server.js`
* **Health Check Endpoint**: `/api/health`

---

## Project Structure

```text
NexPrep-LMS/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI workflow (Node 20, build & test)
├── backend/
│   ├── config/
│   │   ├── db.js                  # Mongoose connection with pooling
│   │   └── firebaseAdmin.js       # Firebase Admin SDK initialization
│   ├── controllers/
│   │   ├── authController.js      # Register, login, googleLogin, getMe
│   │   ├── healthController.js    # Health check & root probe handlers
│   │   ├── progressController.js  # Progress updates, stats & continue learning
│   │   └── testController.js      # Questions, grading, history & dashboard
│   ├── data/
│   │   ├── questionBank.js        # 120 curated questions & authoritative keys
│   │   └── taxonomy.js            # Canonical 3-subject, 12-chapter taxonomy
│   ├── middleware/
│   │   ├── authMiddleware.js      # JWT verification & live user lookup
│   │   ├── errorMiddleware.js     # Centralized 404 & error handlers
│   │   └── rateLimitMiddleware.js # express-rate-limit configuration
│   ├── models/
│   │   ├── Progress.js            # Progress schema with compound unique index
│   │   ├── TestResult.js          # TestResult schema with compound date index
│   │   └── User.js                # User schema with bcrypt & email normalization
│   ├── routes/
│   │   ├── authRoutes.js          # /api/auth endpoints
│   │   ├── healthRoutes.js        # / and /api/health endpoints
│   │   ├── progressRoutes.js      # /api/progress endpoints
│   │   └── testRoutes.js          # /api/tests endpoints
│   ├── scripts/
│   │   └── buildTaxonomy.js       # Build script compiling backend taxonomy to frontend
│   ├── services/
│   │   ├── streakService.js       # Authoritative UTC streak calculation
│   │   └── testScoring.js         # Question sanitization & test evaluation
│   ├── tests/
│   │   ├── auth.test.js           # Authentication & JWT protection tests (8 tests)
│   │   ├── errorHandling.test.js  # Error handling & middleware tests (5 tests)
│   │   ├── indexingPagination.test.js # Indexing & pagination tests (5 tests)
│   │   ├── scoring.test.js        # Server-authoritative scoring tests (12 tests)
│   │   ├── security.test.js       # Helmet, rate limiting & DNS tests (4 tests)
│   │   ├── streak.test.js         # Practice streak calculation tests (9 tests)
│   │   ├── taxonomy.test.js       # Canonical taxonomy tests (6 tests)
│   │   └── validation.test.js     # Taxonomy & input validation tests (12 tests)
│   ├── .env.example               # Template for environment variables
│   ├── package.json               # Backend dependencies & npm scripts
│   └── server.js                  # Express app entry point & server bootstrap
├── frontend/
│   ├── scripts/
│   │   ├── auth.js                # Token management & authenticated fetch client
│   │   ├── authGuard.js           # Route protection script for client views
│   │   ├── chapter.js             # Chapter reading & completion toggle controller
│   │   ├── chapterNames.js        # Generated client taxonomy contract
│   │   ├── config.js              # Environment-aware backend API base URL
│   │   ├── dashboard.js           # Dashboard metrics & streak renderer
│   │   ├── firebaseConfig.js      # Firebase client configuration for Google OAuth
│   │   ├── history.js             # Test history pagination controller
│   │   ├── home.js                # Home view & continue-learning banner controller
│   │   ├── login.js               # Local & Google login controller
│   │   ├── profile.js             # User profile controller
│   │   ├── register.js            # Local registration controller
│   │   └── test.js                # Quiz state machine & 120s countdown timer
│   ├── styles/
│   │   ├── login.css              # Authentication views styling
│   │   ├── profile.css            # Profile view styling
│   │   └── style.css              # Main platform theme & responsive styling
│   ├── chapter.html               # Chapter content reader view
│   ├── chemistry.html             # Chemistry chapter grid view
│   ├── dashboard.html             # Analytics & streak dashboard view
│   ├── history.html               # Paginated test attempt history view
│   ├── home.html                  # Main landing view with continue learning
│   ├── index.html                 # Platform entrance view
│   ├── maths.html                 # Mathematics chapter grid view
│   ├── physics.html               # Physics chapter grid view
│   ├── profile.html               # User account profile view
│   ├── register.html              # Registration view
│   └── test.html                  # Timed test assessment view
├── netlify.toml                   # Netlify static hosting headers & CORS policy
└── README.md                      # Platform documentation
```

---

## Local Setup

### 1. Prerequisites
* **Node.js**: `20.x` or `22.x`
* **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017/nexprep`) or a MongoDB Atlas connection URI

### 2. Backend Installation & Configuration

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Configure the environment variables in `backend/.env`:

```ini
# Server Configuration
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/nexprep
JWT_SECRET=your_secure_development_jwt_secret

# Optional: Set to true if local ISP fails MongoDB Atlas SRV DNS resolution
DNS_OVERRIDE=false

# CORS Whitelist (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500,https://precious-griffin-831939.netlify.app

# Firebase Admin Credentials (Optional for Google OAuth)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_key\n-----END PRIVATE KEY-----\n"
```

Compile the taxonomy contract and start the development server:

```bash
# Compile canonical taxonomy into frontend contract
npm run build:taxonomy

# Run backend with automatic reload
npm run dev

# Run test suite
npm test
```

### 3. Frontend Setup

Serve the static frontend files using any local web server:

```bash
cd frontend

# Using Python 3
python -m http.server 3000

# Alternatively using Node.js npx serve
npx serve -l 3000 .
```

Open `http://localhost:3000` in your browser.

---

## Future Roadmap

* **Mathematical Formula & Notation Rendering**: Integrate KaTeX or MathJax to render complex algebraic notation, calculus expressions, and chemical formulas natively within chapter notes and test questions.
* **Full-Length Composite JEE Mock Exams**: Multi-subject exam mode simulating the full 3-hour JEE format across Physics, Chemistry, and Mathematics, complete with section-level time management and standard JEE negative marking evaluation.
* **HTTP-Only Cookie Session Strategy**: Support an optional HTTP-only secure cookie session delivery alongside the existing Bearer JWT model, providing enhanced XSS mitigation for browser-only deployments.
