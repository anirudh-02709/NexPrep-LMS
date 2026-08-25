# NexPrep LMS

[![NexPrep Backend CI](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml/badge.svg)](https://github.com/anirudh-02709/NexPrep-LMS/actions/workflows/ci.yml)
![Node Version](https://img.shields.io/badge/node-20.x%20%7C%2022.x-brightgreen)
![Tests](https://img.shields.io/badge/tests-52%20passing-success)
![License](https://img.shields.io/badge/license-ISC-blue)

NexPrep is a full-stack Learning Management System (LMS) engineered for JEE (Joint Entrance Examination) aspirants. It provides structured chapter-wise concept navigation, server-authoritative timed testing, persistent telemetry tracking, and personalized performance analytics.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend ["1. Frontend Client (Static / Netlify)"]
        UI["HTML5 Views & Vanilla CSS<br/>(home, physics, chemistry, maths, test, dashboard)"]
        AuthScript["auth.js & apiFetch<br/>(Token Management & API Client)"]
        QuizEngine["test.js<br/>(Timed State & Answer Selection)"]
        TaxonomyCache["chapterNames.js<br/>(Generated Frontend Contract)"]
    end

    subgraph ExpressGateway ["2. Express.js REST Gateway"]
        GlobalSec["Global Security Layer<br/>(Helmet Security Headers, CORS Whitelist, 100kb Limit)"]
        
        subgraph RouteHandling ["Route Dispatch & Specialized Middleware"]
            HealthRoute["Health Routes<br/>(/, /api/health)"]
            AuthRoute["Auth Routes<br/>(/api/auth/register, /login, /google)"]
            AuthLimiter["authLimiter<br/>(express-rate-limit: 20 req/15min)"]
            
            ProtectedRoutes["Protected Routes<br/>(/api/progress/*, /api/tests/*, /api/auth/me)"]
            AuthMiddleware["authMiddleware (protect)<br/>(JWT Verification & Live User Lookup)"]
        end
        
        ErrorHandler["Centralized Error Pipeline<br/>(errorMiddleware & notFound Handler)"]
    end

    subgraph AppLogic ["3. Application Logic & Services"]
        HealthCtrl["healthController.js<br/>(Liveness Probes)"]
        AuthCtrl["authController.js<br/>(Bcrypt Hashing & Account Merging)"]
        ProgressCtrl["progressController.js<br/>(Atomic Upserts & Subject Stats)"]
        TestCtrl["testController.js<br/>(Pagination & Performance Analytics)"]
        ScoringSvc["testScoring.js<br/>(Authoritative Evaluator & Sanitizer)"]
    end

    subgraph CanonicalData ["4. Canonical Content (Single Source of Truth)"]
        CanonicalTaxonomy["taxonomy.js<br/>(Canonical Subject/Chapter Enum)"]
        AuthoritativeQB["questionBank.js<br/>(120 Curated Questions & Answer Keys)"]
    end

    subgraph Persistence ["5. Persistence & External Services"]
        MongoDB[("MongoDB Atlas<br/>(users, progresses, testresults)")]
        FirebaseAdmin["Firebase Admin SDK<br/>(Google ID Token Verification)"]
    end

    %% Client to Gateway
    UI --> AuthScript
    AuthScript -->|HTTP / REST Requests| GlobalSec
    GlobalSec --> HealthRoute
    GlobalSec --> AuthRoute
    GlobalSec --> ProtectedRoutes

    %% Gateway Routing & Middleware
    HealthRoute -->|Public (No Auth)| HealthCtrl
    AuthRoute --> AuthLimiter
    AuthLimiter --> AuthCtrl
    ProtectedRoutes -->|Requires Bearer Token| AuthMiddleware
    AuthMiddleware -->|Authenticated User| ProgressCtrl
    AuthMiddleware -->|Authenticated User| TestCtrl
    AuthMiddleware -->|Authenticated User| AuthCtrl

    %% Controller Integrations
    AuthCtrl -->|Verify Google idToken| FirebaseAdmin
    AuthCtrl -->|User Queries & Bcrypt Hashes| MongoDB

    ProgressCtrl -->|Subject/Chapter Validation| CanonicalTaxonomy
    ProgressCtrl -->|Atomic Progress Upserts| MongoDB

    TestCtrl -->|Sanitized Questions & Evaluation| ScoringSvc
    TestCtrl -->|Compound-Indexed Queries| MongoDB

    ScoringSvc -->|Read-Only (Strips Answer Keys)| AuthoritativeQB
    ScoringSvc -->|Server-Side Grading| AuthoritativeQB

    %% Error Handling (Express Pipeline)
    ExpressGateway -.->|Unhandled Errors & 404s| ErrorHandler

    %% Build-Time Contract Sync
    CanonicalTaxonomy -.->|npm run build:taxonomy (Build-Time Sync)| TaxonomyCache
    TaxonomyCache -.->|Static Import| UI
```

---

## Key Features

* **Dual Authentication System**: Supports local email/password authentication (salted with 12 bcrypt rounds) and Google OAuth via Firebase ID token verification, with automatic account linking by normalized email.
* **Server-Authoritative Test Engine**: Evaluates tests entirely on the server against a curated 120-question bank. Correct answers are never transmitted to the client, preventing answer inspection and score tampering.
* **Granular Progress Telemetry**: Tracks last-visited timestamps and chapter completion states with atomic upsert operations on compound indexed collections.
* **Rule-Based Performance Insights**: Computes subject-wise averages, identifies strongest and weakest subject areas, calculates 7-day consistency activity, and detects performance trajectories across test attempts.
* **Paginated Test History**: Implements compound-indexed (`{ user: 1, createdAt: -1 }`) query pagination with lean document projection for minimal memory overhead.
* **Single-Source Taxonomy**: Generates frontend subject/chapter contracts directly from canonical backend definitions using an automated build script (`npm run build:taxonomy`).

---

## Authentication & Authorization Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Student
    participant Browser as Client (login.js / apiFetch)
    participant Server as Express Server
    participant Firebase as Firebase Admin SDK
    participant DB as MongoDB Atlas

    alt Local Authentication
        User->>Browser: Enters Email & Password
        Browser->>Server: POST /api/auth/login
        Server->>DB: User.findOne({ email })
        DB-->>Server: User record (with bcrypt hash)
        Server->>Server: bcrypt.compare(password, hash)
        Server-->>Browser: Signed JWT (7d expiry) + User profile
    else Google OAuth
        User->>Browser: Clicks "Continue with Google"
        Browser->>Browser: Firebase Popup (Google Auth)
        Browser->>Server: POST /api/auth/google { idToken }
        Server->>Firebase: admin.auth().verifyIdToken(idToken)
        Firebase-->>Server: Decoded token { email, uid, name }
        Server->>DB: Find or Upsert User by normalized email
        Server-->>Browser: Signed JWT (7d expiry) + User profile
    end

    Note over Browser,Server: Subsequent Protected API Requests
    Browser->>Server: GET /api/tests/dashboard (Authorization: Bearer <JWT>)
    Server->>Server: authMiddleware (jwt.verify)
    Server->>DB: User.findById(decoded.id).select('-password')
    DB-->>Server: Live user document
    Server-->>Browser: Requested Protected Data
```

---

## Server-Authoritative Test & Scoring Engine

A core architectural principle of NexPrep is that **the client is never trusted with answer evaluation**.

1. **Sanitization on Retrieval**: When a client requests questions (`GET /api/tests/questions`), `testScoring.js` maps through the authoritative question bank and strips out the `answer` index.
2. **Client Submission**: During a timed 120-second session, the client records option choices and submits only the question IDs and selected option indices (`POST /api/tests/result`).
3. **Server Validation**: The server validates that:
   - The submission array matches the exact question count for that chapter.
   - All question IDs strictly belong to the specified subject and chapter.
   - No duplicate question IDs are submitted.
   - Selected option indices are valid integers within the `[0, 3]` range.
4. **Grading & Persistence**: The server computes the score in-memory ($O(1)$ lookup per question) and commits the authoritative result to MongoDB.

---

## Database Architecture

NexPrep differentiates dynamic, user-generated transactional data stored in MongoDB from static curriculum content versioned in code.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MONGODB ATLAS SCHEMAS                           │
├────────────────────────────────────────────────────────────────────────┤
│ 1. User                                                                │
│    - name: String (trimmed, max 100)                                   │
│    - email: String (unique, lowercase, normalized)                     │
│    - password: String (bcrypt hash, omitted on OAuth)                  │
│    - firebaseUid: String (sparse unique)                               │
│    - authProvider: String ('local' | 'google')                         │
│    - createdAt: Date                                                   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Progress                                                            │
│    - user: ObjectId (ref -> User)                                      │
│    - subject: String (enum -> ALL_SUBJECTS)                            │
│    - chapter: String (enum -> ALL_CHAPTERS)                            │
│    - completed: Boolean (default: false)                               │
│    - lastOpenedAt: Date                                                │
│    * Compound Unique Index: { user: 1, subject: 1, chapter: 1 }         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. TestResult                                                          │
│    - user: ObjectId (ref -> User)                                      │
│    - subject: String (enum -> ALL_SUBJECTS)                            │
│    - chapter: String (enum -> ALL_CHAPTERS)                            │
│    - score: Number (integer, min: 0)                                   │
│    - totalQuestions: Number (integer, min: 1)                          │
│    - createdAt: Date                                                   │
│    * Compound Index: { user: 1, createdAt: -1 }                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Canonical Taxonomy Synchronization

To eliminate schema drift across the client and server, the curriculum taxonomy is maintained in a single file:

```
backend/data/taxonomy.js (Source of Truth)
       │
       ├──> Express Validation & Mongoose Schema Enums
       │
       └──> npm run build:taxonomy (scripts/buildTaxonomy.js)
                 │
                 ▼
       frontend/scripts/chapterNames.js (Generated Contract)
                 │
                 ├──> physics.html, chemistry.html, maths.html (Dynamic Cards)
                 ├──> test.js (Quiz Navigation)
                 └──> dashboard.js / home.js (Progress Trackers)
```

---

## Security & Reliability Controls

* **Password Security**: Salted hashing with `bcryptjs` (work factor: 12 rounds).
* **JWT Authorization**: 7-day expiration with token decoding and live user verification.
* **Rate Limiting**: `express-rate-limit` enforces a strict 20 request per 15-minute quota on `/api/auth/register`, `/api/auth/login`, and `/api/auth/google` to defend against brute-force attacks.
* **Security Headers**: `helmet` manages security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `HSTS`, `X-DNS-Prefetch-Control`) with `crossOriginResourcePolicy: { policy: 'cross-origin' }`.
* **CORS Origin Whitelist**: Dynamic origin validation against configured environment domains with local development fallback.
* **Conditional DNS Resolver**: Opt-in Google Public DNS override (`DNS_OVERRIDE=true`) for local ISP SRV resolution resilience without interfering with production container discovery.
* **Payload Limits & Error Handling**: Request bodies restricted to `100kb`; centralized error middleware formats status codes cleanly without leaking internal stack traces.

---

## API Reference

| Method | Endpoint | Purpose | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | API status health probe | Public |
| `GET` | `/api/health` | Service liveness check | Public |
| `POST` | `/api/auth/register` | Register local account | Public (Rate-Limited) |
| `POST` | `/api/auth/login` | Authenticate with email/password | Public (Rate-Limited) |
| `POST` | `/api/auth/google` | Authenticate with Firebase ID token | Public (Rate-Limited) |
| `GET` | `/api/auth/me` | Retrieve authenticated user profile | Bearer JWT |
| `POST` | `/api/progress/update` | Record chapter visit timestamp | Bearer JWT |
| `POST` | `/api/progress/complete` | Mark chapter as completed | Bearer JWT |
| `POST` | `/api/progress/incomplete` | Mark chapter as incomplete | Bearer JWT |
| `GET` | `/api/progress/status` | Get chapter completion status | Bearer JWT |
| `GET` | `/api/progress/stats` | Get subject-wise completion stats | Bearer JWT |
| `GET` | `/api/progress/continue` | Get last visited chapter | Bearer JWT |
| `GET` | `/api/tests/questions` | Fetch sanitized test questions | Bearer JWT |
| `POST` | `/api/tests/result` | Submit test answers for grading | Bearer JWT |
| `GET` | `/api/tests/history` | Get paginated test attempt history | Bearer JWT |
| `GET` | `/api/tests/dashboard` | Get performance metrics & insights | Bearer JWT |

---

## Automated Testing & CI

The backend test suite runs natively via Node.js with zero third-party testing dependencies:

* **52 automated unit and validation tests** across **7 test suites**.
* **GitHub Actions CI** validates every push and pull request targeting `main`.

```bash
# Run the complete test suite locally
cd backend
npm test
```

### Test Suite Breakdown

```
▶ Authentication & JWT Protection Suite (8 tests) ...................... ✔ PASS
▶ Production Error Handling & Middleware Suite (5 tests) ............... ✔ PASS
▶ Query Efficiency, Indexing & Pagination Suite (5 tests) ............... ✔ PASS
▶ Server-Authoritative Test Scoring & Question Sanitization (12 tests) . ✔ PASS
▶ Security, Helmet & Rate Limiting Suite (4 tests) ..................... ✔ PASS
▶ Canonical Single-Source Taxonomy Suite (6 tests) ..................... ✔ PASS
▶ Taxonomy & Input Validation Suite (12 tests) ......................... ✔ PASS
```

---

## Engineering Decisions & Tradeoffs

### 1. Server-Authoritative Scoring vs. Client Evaluation
* **Decision**: All question verification and grading occurs strictly on the server; client applications receive sanitized questions with no answer properties.
* **Tradeoff**: Increases API payload processing slightly during test submission, but eliminates client-side answer inspection and prevents fabricated score submissions.

### 2. Static Curriculum vs. Database-Driven Content
* **Decision**: 12 core chapters and 120 curated questions are version-controlled as canonical JavaScript modules, compiled to the frontend via `buildTaxonomy.js`.
* **Tradeoff**: Adding questions requires a code commit and deployment rather than an administrative CMS UI. However, it yields $O(1)$ in-memory lookups, zero database query overhead during test taking, and absolute type/enum safety.

### 3. Vanilla JavaScript vs. Frontend Framework
* **Decision**: The frontend uses standard HTML5, modern CSS3, and ES6 JavaScript.
* **Tradeoff**: Managing component state across distinct multi-page views requires explicit DOM updates and event binding. In exchange, the application has zero bundle-compilation overhead, ultra-fast initial page loads, and directly demonstrates foundational browser and DOM mechanics.

### 4. Compound Indexing on MongoDB Collections
* **Decision**: Created compound index `{ user: 1, createdAt: -1 }` on `testresults` and `{ user: 1, subject: 1, chapter: 1 }` on `progresses`.
* **Tradeoff**: Requires minimal additional storage and index write overhead on test submission, but guarantees $O(\log N)$ query performance for user dashboard summaries and paginated history.

---

## Project Structure

```text
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow
├── backend/
│   ├── config/                # MongoDB & Firebase Admin initialization
│   ├── controllers/           # Auth, Health, Progress, and Test controllers
│   ├── data/                  # Canonical taxonomy and 120-question bank
│   ├── middleware/            # JWT protect, rate limiting, error handling
│   ├── models/                # User, Progress, and TestResult Mongoose schemas
│   ├── routes/                # Express REST API routes
│   ├── scripts/               # buildTaxonomy.js synchronization script
│   ├── services/              # testScoring.js evaluation service
│   ├── tests/                 # 7 test suites (52 tests via node:test)
│   ├── .env.example
│   ├── package.json
│   └── server.js              # Express app entry point
├── frontend/
│   ├── scripts/               # Client controllers (auth, test, dashboard, etc.)
│   ├── styles/                # CSS stylesheets (login, profile, main style)
│   ├── *.html                 # Application views (home, test, dashboard, etc.)
│   └── netlify.toml           # Static hosting headers & routing
└── README.md
```

---

## Local Setup

### 1. Prerequisites
* **Node.js**: `20.x` or `22.x`
* **MongoDB**: Local MongoDB instance or MongoDB Atlas cluster connection URI

### 2. Backend Setup
```bash
cd backend
npm install
copy .env.example .env     # On Windows (or 'cp .env.example .env' on Linux/macOS)
```

Configure `backend/.env`:
```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/nexprep
JWT_SECRET=your_jwt_secret_key
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500

# Optional: Set to true if local ISP fails MongoDB Atlas SRV DNS resolution
DNS_OVERRIDE=false

# Optional for Google OAuth:
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Compile taxonomy and start server:
```bash
npm run build:taxonomy
npm run dev
```

Run test suite:
```bash
npm test
```

### 3. Frontend Setup
Serve static frontend files from any static web server:
```bash
cd frontend
python -m http.server 3000
```
Open `http://localhost:3000` in your browser.

---

## Screenshots & Visuals

> [!NOTE]
> Screenshots and interactive UI recordings can be placed in an `assets/` directory to visually demonstrate the dashboard analytics, timed quiz interface, and responsive study panels.

---

## Future Roadmap

* **Mathematical Formula Rendering**: Integration of KaTeX / MathJax for rendering complex LaTeX mathematical notations and chemical reaction formulas.
* **HTTP-Only Cookie Session Option**: Supporting dual-mode authorization (Bearer token header for API clients, HTTP-only secure cookie for web browser sessions).
* **Comprehensive Full-Length Mock Exams**: 3-hour composite examination mode combining Physics, Chemistry, and Mathematics with JEE-standard negative marking schemes.
