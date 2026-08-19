# NexPrep LMS

NexPrep is a full-stack JEE Learning Management System (LMS) designed for chapter-wise preparation, progress tracking, server-authoritative testing, and performance analytics.

---

## Tech Stack

* **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+), Firebase Web SDK (v12.7)
* **Backend**: Node.js, Express.js (v4.21), MongoDB with Mongoose (v9.6)
* **Authentication**: JSON Web Tokens (`jsonwebtoken`), Password Hashing (`bcryptjs`), Google OAuth (`firebase-admin`)
* **Testing**: Node.js Built-in Test Runner (`node:test`, `node:assert/strict`)

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │                   Frontend Client                      │
 │   - Static HTML5, Vanilla CSS3, ES6 JavaScript         │
 │   - Lightweight apiFetch with Bearer token injection   │
 │   - Single-Source Taxonomy (chapterNames.js)           │
 └──────────────────────────┬─────────────────────────────┘
                            │ REST API (JSON / HTTP)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                 Express.js Backend                     │
 │   - CORS Whitelist & Body Parser Limits                │
 │   - JWT Protect Middleware (User Existence Check)      │
 │   - Authoritative Question Bank & Scoring Service      │
 │   - Deterministic Performance Insights Engine          │
 └─────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐
 │       MongoDB Atlas       │ │   Firebase Admin SDK      │
 │  - users                  │ │  - Google ID Token        │
 │  - progresses             │ │    Verification           │
 │  - testresults (indexed)  │ │                           │
 └───────────────────────────┘ └───────────────────────────┘
```

---

## Core Implemented Features

1. **Authentication & Security**:
   * Local registration and login with salt-hashed passwords (`bcryptjs`, 12 rounds).
   * Google OAuth login via Firebase ID token verification.
   * Canonical email normalization (`trim().toLowerCase()`) across local and OAuth accounts with seamless provider merging.
   * JWT-protected endpoints verifying live database user existence.
   * Input validation, taxonomy whitelist checks, and stored-XSS protection.

2. **Single Authoritative Taxonomy**:
   * Centralized subject/chapter taxonomy in `backend/data/taxonomy.js`.
   * Deterministic frontend code generation via `npm run build:taxonomy`.
   * 12 core chapters across 3 subjects:
     * **Physics**: Kinematics, Newton's Laws, Work Power Energy, Rotational Motion
     * **Chemistry**: Atomic Structure, Chemical Bonding, Thermodynamics, Electrochemistry
     * **Mathematics**: Quadratic Equations, Sequences & Series, Limits & Derivatives, Matrices

3. **Server-Authoritative Test Engine**:
   * Authoritative backend question bank containing 120 curated questions (10 per chapter).
   * Clients receive sanitized question prompts and options (correct answers are never transmitted).
   * Timed tests (120 seconds) with question navigation and client-side selection state.
   * Submissions graded entirely on the server; client-supplied scores cannot tamper with results.

4. **Progress Tracking**:
   * Tracks recently visited chapters for the "Continue Learning" dashboard card.
   * Toggle chapter completion state ("Mark as Completed" / "Mark as Incomplete").
   * Subject completion percentage and completed chapter counters.

5. **Performance Insights & Analytics**:
   * Deterministic, rule-based analytics evaluating test scores across subjects.
   * Identifies focus area (weakest subject), strongest subject, performance trend, and recommendations.
   * Daily activity streak calculation.

6. **Paginated Test History**:
   * Fast, indexed queries (`{ user: 1, createdAt: -1 }`) supporting `page` and `limit` query parameters.
   * Memory-efficient `.lean()` database projections.

---

## Database Collections

* **`users`**: Stores user accounts (`name`, `email` [normalized/unique], `password` [bcrypt hash], `firebaseUid`, `authProvider`).
* **`progresses`**: Tracks chapter completion and visits (`user`, `subject` [enum], `chapter` [enum], `completed`, `lastVisited`).
* **`testresults`**: Stores evaluated test attempts (`user`, `subject` [enum], `chapter` [enum], `score`, `totalQuestions`, `createdAt` [compound index with `user`]).

---

## Key API Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new user account with hashed password |
| `POST` | `/api/auth/login` | Public | Authenticate user and receive signed JWT |
| `POST` | `/api/auth/google` | Public | Authenticate with Firebase Google ID token |
| `GET` | `/api/auth/me` | Bearer | Get authenticated user profile data |
| `POST` | `/api/progress/update` | Bearer | Update chapter visit telemetry |
| `POST` | `/api/progress/complete` | Bearer | Mark chapter as completed |
| `POST` | `/api/progress/incomplete` | Bearer | Mark chapter as incomplete |
| `GET` | `/api/progress/stats` | Bearer | Get subject completion percentages |
| `GET` | `/api/progress/continue` | Bearer | Get last visited chapter |
| `GET` | `/api/tests/questions` | Bearer | Get sanitized test questions for a chapter |
| `POST` | `/api/tests/result` | Bearer | Submit answers for server evaluation & persistence |
| `GET` | `/api/tests/history` | Bearer | Get paginated test history (`?page=1&limit=10`) |
| `GET` | `/api/tests/dashboard` | Bearer | Get test counts, average scores & performance insights |

---

## Project Structure

```text
├── backend/
│   ├── config/             # MongoDB and Firebase Admin configurations
│   ├── controllers/        # Auth, Progress, Test, and Health controllers
│   ├── data/               # Question bank and canonical taxonomy
│   ├── middleware/         # JWT authentication and error middlewares
│   ├── models/             # User, Progress, and TestResult Mongoose schemas
│   ├── routes/             # Express API routes
│   ├── scripts/            # Taxonomy builder script (buildTaxonomy.js)
│   ├── services/           # Server-authoritative test scoring service
│   ├── tests/              # 6 automated test suites (node:test)
│   ├── package.json
│   └── server.js           # Express app entry point
└── frontend/
    ├── scripts/            # Client-side SPA controllers, auth, and config
    ├── styles/             # Stylesheets (Vanilla CSS)
    ├── *.html              # Application pages (Home, Dashboard, Test, History, Profile, Chapter, etc.)
    └── netlify.toml        # Frontend static hosting configuration
```

---

## Local Setup

### 1. Backend Setup

```bash
cd backend
npm install
copy .env.example .env
```

Configure `backend/.env`:
```text
PORT=5000
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500

# Optional Google OAuth:
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Compile taxonomy and run dev server:
```bash
npm run build:taxonomy
npm run dev
```

Run test suite:
```bash
npm test
```

### 2. Frontend Setup

Serve frontend static files:
```bash
cd frontend
python -m http.server 3000
```

---

## Deployment Architecture

* **Frontend**: Static web assets deployable to any static host (Netlify, Vercel, GitHub Pages) with security headers configured via `netlify.toml`.
* **Backend**: Node.js/Express service deployable to Render, Railway, or Heroku, connecting to MongoDB Atlas with CORS whitelist configured via `ALLOWED_ORIGINS`.
