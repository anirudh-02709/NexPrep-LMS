# NexPrep LMS

NexPrep is a JEE LMS project with a pure HTML/CSS/JavaScript frontend and a Node.js + Express + MongoDB backend.

## Local Setup

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Create backend environment file:

```bash
copy .env.example .env
```

3. Fill in the required values in `backend/.env`.

4. Update frontend API/Firebase config placeholders:

```text
frontend/scripts/config.js
frontend/scripts/firebaseConfig.js
```

## Backend Start

From the `backend` folder:

```bash
npm run dev
```

Production-style start:

```bash
npm start
```

## Frontend Start

Open the frontend pages directly in the browser, starting with:

```text
frontend/pages/index.html
```

For local API calls, keep:

```js
const API_BASE_URL = 'http://localhost:5000';
```

For deployment, replace it with the deployed backend URL.

## Required Backend Environment Variables

```text
PORT
MONGO_URI
JWT_SECRET
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

## Firebase Configuration

Backend Firebase Admin credentials live in `backend/.env`.

Frontend Firebase Web config lives in:

```text
frontend/scripts/firebaseConfig.js
```

Required frontend Firebase values:

```text
apiKey
authDomain
projectId
appId
```

## Secrets

Do not commit real `.env` files, Firebase service account JSON files, private keys, or deployment secrets.
