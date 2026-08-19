# NexPrep LMS

NexPrep is a full-stack JEE Learning Management System (LMS) designed for chapter-wise preparation, progress tracking, server-authoritative testing, and performance analytics.

---

## Tech Stack

* **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+), Firebase Web SDK (v12.7)
* **Backend**: Node.js, Express.js (v4.21), MongoDB with Mongoose (v9.6)
* **Authentication**: JSON Web Tokens (`jsonwebtoken`), Password Hashing (`bcryptjs`), Google OAuth (`firebase-admin`)
* **Testing**: Node.js Built-in Test Runner (`node:test`, `node:assert/strict`)

---

## Core Implemented Features

1. **Authentication & Security**:
   * Local registration and login with salt-hashed passwords (`bcryptjs`, 12 rounds).
   * Google OAuth login via Firebase ID token verification.
   * Canonical email normalization across local and OAuth registrations.
   * JWT-protected endpoints verifying database user existence.
   * Input length validation, schema-level boundary checks, and stored-XSS protection.

2. **Single Authoritative Taxonomy**:
   * Centralized subject/chapter taxonomy in `backend/data/taxonomy.js`.
   * Deterministic frontend code generation via `npm run build:taxonomy`.
   * 12 core chapters across 3 subjects:
     * **Physics**: Kinematics, Newton's Laws, Work Power Energy, Rotational Motion
     * **Chemistry**: Atomic Structure, Chemical Bonding, Thermodynamics, Electrochemistry
     * **Mathematics**: Quadratic Equations, Sequences & Series, Limits & Derivatives, Matrices

3. **Server-Authoritative Test Engine**:
   * Authoritative backend question bank containing 120 curated questions (10 per chapter).
   * Clients receive sanitized question prompts and option lists (correct answer keys never exposed).
   * Timed tests (120 seconds) with interactive question navigation.
   * Submissions graded entirely on the server; tampering with client-supplied scores is impossible.

4. **Progress Tracking**:
   * Track recently visited chapters and continue learning from the home page.
   * Toggle chapter completion state ("Mark as Completed" / "Mark as Incomplete").
   * Subject completion percentage and completed chapter statistics.

5. **Performance Insights & Analytics**:
   * Deterministic, rule-based analytics evaluating test scores across subjects.
   * Identifies focus area (weakest subject), strongest subject, performance trend, and study recommendations.
   * Daily activity streak calculation.

6. **Paginated Test History**:
   * Fast, indexed queries (`{ user: 1, createdAt: -1 }`) supporting `page` and `limit` query parameters.
   * Memory-efficient `.lean()` database queries.

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
│   ├── scripts/            # Taxonomy builder script
│   ├── services/           # Server-authoritative test scoring service
│   ├── tests/              # Unit and integration test suites
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

Fill in the required values in `backend/.env`:
* `PORT=5000`
* `MONGO_URI=your_mongodb_connection_string`
* `JWT_SECRET=your_jwt_secret_key`
* `FIREBASE_PROJECT_ID=your_project_id` (Optional for local auth)
* `FIREBASE_CLIENT_EMAIL=your_client_email` (Optional for local auth)
* `FIREBASE_PRIVATE_KEY=your_private_key` (Optional for local auth)

Build taxonomy and start dev server:
```bash
npm run build:taxonomy
npm run dev
```

Run test suite:
```bash
npm test
```

### 2. Frontend Setup

Open the frontend files in your browser directly or serve them with a static HTTP server:
```bash
cd frontend
# e.g., using Python static server or opening index.html directly
python -m http.server 3000
```

Frontend configuration files:
* `frontend/scripts/config.js`: Points to `http://localhost:5000` when on localhost.
* `frontend/scripts/firebaseConfig.js`: Optional Google Auth client credentials.

---

## Deployment Architecture

* **Frontend**: Static web assets deployable to any static host (Netlify, Vercel, GitHub Pages). Configured via `netlify.toml`.
* **Backend**: Node.js/Express service deployable to Render, Railway, or Heroku, connecting to a MongoDB Atlas cluster.
